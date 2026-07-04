# Phase 2b — Editor rendering: red failing cells + hover-actual (CodeMirror)

Date: 2026-06-28
Status: design, pending implementation (TDD). Adapter layer; builds on the
Phase 1 + Phase 2a core ([cell-diff](2026-06-28-cell-diff-design.md),
[table & doc-string](2026-06-28-table-docstring-return-comparison-design.md)).

## Why

The core already fails a mismatch with structured, span-anchored data
(`CellMismatchError.cells: CellDiff[]`, `DocStringMismatchError.diff`). Until
now the website editor only shows that at the line level — a fail wash + a `✗`
gutter whose click opens the stack trace. Phase 2b surfaces the *precise* signal
in the live editor: the failing cell's text turns **red**, and hovering it
reveals the **actual runtime value**.

The reader sees the value they wrote (e.g. `6`) in red — "this written value is
wrong" — and the hover answers "wrong how?" with `actual: 9`. The document is
never modified; only the *rendering* of the existing source changes.

## Resolved decisions

- **Red marks the source span; we never edit the document.** A
  `Decoration.mark` over each `CellDiff.span` / `DocStringDiff.span` adds a CSS
  class so the existing source text (the expected value) renders red.
- **Hover shows `actual: <value>`.** A CodeMirror `hoverTooltip` over the same
  spans shows the runtime value, labeled (`actual: 9`).
- **Additive with today's line wash.** The existing per-example line wash
  (`.cm-run-pass` / `.cm-run-fail`), the gutter `✗`/`✓`, and the click-to-open
  stack dialog are all **unchanged**. The red cell + hover layer on top. The red
  is tuned to stay legible on the fail wash (bold / a darker red if needed).
- **No-cell failures unchanged.** A plain thrown `Error` or a `ReturnShapeError`
  carries no `CellDiff`s, so it shows only the wash + `✗` + stack dialog, exactly
  as today.

## Three rendering cases (one mechanism)

| Failure | What turns red | Hover |
|---------|----------------|-------|
| header-bound row | the one mismatched cell in the row | `actual: <value>` |
| whole table | every mismatched cell across the table | `actual: <value>` per cell |
| doc string | the whole fence body span (exact-equality → no intra-string diff) | `actual: <returned text>` |

All three come from the same `(span, actual)` pairs — rows/tables via
`CellMismatchError.cells` (the `!ok` entries), doc strings via
`DocStringMismatchError.diff`.

## Architecture (adapter only — core untouched)

```
@oselvar/var (core)          website adapter
─────────────────            ─────────────────────────────────────────────
CellMismatchError.cells  →   run-spec.ts: isCellMismatchError(err) → pull
DocStringMismatchError.diff   isDocStringMismatchError(err) → pull
                             run-types.ts: ExampleResult.failure gains
                               cells?: CellFailure[]  /  doc?: CellFailure
                             cm-run.ts: mark-decoration field + hoverTooltip
```

### `run-types.ts`

```ts
type CellFailure = {
  readonly from: number  // CellDiff.span.startOffset (== CM doc position)
  readonly to: number    // CellDiff.span.endOffset
  readonly actual: string
}
// ExampleResult.failure gains:
readonly cells?: ReadonlyArray<CellFailure> // table / row mismatches
readonly doc?: CellFailure                  // doc-string mismatch (one span)
```

`from`/`to` are the source offsets the core already computed; the editor doc is
the parsed source verbatim, so they map straight to CodeMirror positions.

### `run-spec.ts`

In the `catch`, after building the existing `failure`, inspect the error:

```ts
import { isCellMismatchError, isDocStringMismatchError } from '@oselvar/var'
// ...
const cells = isCellMismatchError(e)
  ? e.cells.filter((c) => !c.ok).map((c) => ({
      from: c.span.startOffset, to: c.span.endOffset, actual: c.actual,
    }))
  : undefined
const doc = isDocStringMismatchError(e)
  ? { from: e.diff.span.startOffset, to: e.diff.span.endOffset, actual: e.diff.actual }
  : undefined
// failure: { line, message, stack, ...(cells && { cells }), ...(doc && { doc }) }
```

Pure data extraction; no new dependency (the guards are already exported from
`@oselvar/var`).

### `cm-run.ts`

- **Mark decorations.** A second `StateField<DecorationSet>` (separate from the
  line-wash field to avoid mixing line + range decorations in one sorted set)
  builds a `Decoration.mark({ class: 'cm-run-cell-fail' })` for every
  `failure.cells[*]` and `failure.doc` range, clamped to the doc. Provided via
  `EditorView.decorations`. Recomputed on `setRunResults`; mapped through edits
  (so it clears with the stale results, same as the washes).
- **Hover.** A `hoverTooltip((view, pos) => …)` that scans the current results'
  cell/doc ranges for one covering `pos` and returns a tooltip whose DOM is
  `actual: <value>`. Returns `null` otherwise.
- **Theme.** `.cm-run-cell-fail { color: var(--ed-fail-mark); font-weight: 700 }`
  (reuse the existing fail-mark token; bump weight for legibility on the wash) —
  exact token/weight settled during implementation against both themes. A small
  `.cm-run-cell-tip` style for the tooltip.

`varRunExtension()` returns the existing extensions plus the new mark field, the
hover, and the theme additions.

## Data flow / staleness

Results arrive via the existing `setRunResults` `StateEffect` and are cleared on
`docChanged` — the red marks and tooltips ride the same field, so when results
are showing, the offsets are guaranteed valid against the current doc (any edit
clears everything until the next debounced run). No separate invalidation.

## Out of scope / non-goals

- **VSCode.** Same red+hover is desirable there but needs run results to reach
  the editor, which the static LSP doesn't carry. Separate effort; not here.
- **Intra-value diffs** (jsdiff highlighting *part* of a long doc string or
  cell). v1 reddens the whole span. A future refinement, in the adapter only.
- **No core changes.** Phase 2b consumes the existing `CellDiff`/`DocStringDiff`
  exactly as shipped.

## Testing (TDD order)

1. **`run-spec`** (unit, jsdom-free): a header-bound row mismatch yields
   `failure.cells` with the right `{from,to,actual}` (offsets slice back to the
   expected cell text; `actual` is the runtime value); a doc-string mismatch
   yields `failure.doc`; a `ReturnShapeError` / plain throw yields neither
   (`cells`/`doc` undefined). Whole-table yields multiple `cells`.
2. **`cm-run`** (unit): given a `RunResults` with `failure.cells`, the built mark
   `DecorationSet` has ranges exactly matching the cell `from`/`to`; the hover
   callback returns a tooltip with `actual: <value>` inside a cell range and
   `null` outside. (Follows the existing `cm-run` test style.)
3. **Manual browser check**: in the playground, break a Yahtzee cell → that
   cell's text goes red, hover shows `actual: <n>`; the row wash + `✗` + stack
   still work. Break the `06` table and doc string → red cells / red body +
   hover. Edit → everything clears.
