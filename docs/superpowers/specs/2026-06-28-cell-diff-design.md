# Header-bound table cell diffs (`~~expected~~actual`)

Date: 2026-06-28
Status: design, pending implementation (TDD)

## Why

When a header-bound table row fails, the most useful thing we can show is the
failing cell as a diff: the spec's expected value struck through, the computed
actual value inserted beside it — `score: ` ~~9~~ `6`. On the live front-page
editor this is a small "wow"; in a real run it's the seed of snapshot-style
"accept this value" tooling.

The rendering is the easy part. The hard part is getting a **structured**
`(column, expected, actual)` signal instead of a free-text error message. We get
that by having the **pure core own the comparison**: row-mode steps return their
computed columns, and the core diffs them against the table cells. That single
decision keeps the diff signal identical for every consumer — the live editor
now, a `.var/` recorder later — with no string parsing anywhere.

## Resolved decisions

- **Return-based comparison.** A row-mode step returns an object keyed by column
  (`{ score: 6 }`); the core compares each returned column against that row's
  cell. (Not: assert-and-parse.)
- **Live `~~9~~6` first.** After the core lands, the first adapter is the
  browser editor; the `var-vitest` `.var/` recorder and "accept" come later.
- **Diff stays in adapters.** The core's `CellDiff` carries the raw `expected`
  and `actual` strings only. Turning that into a visual strike/insert is a
  presentation concern, so any diff library lives in the rendering adapter, not
  the core (which stays dependency-light). v1 needs no diff library at all —
  whole-cell strike + insert. When intra-value diffs are wanted later
  (long string cells, doc strings), reach for `diff` (jsdiff) **in the adapter**.

## Core data model (pure, `@oselvar/var`)

```ts
// ast.ts — each table cell gains a source range.
type Row = {
  readonly cells: ReadonlyArray<string>
  readonly cellSpans: ReadonlyArray<Span> // NEW — one per cell, trimmed-text range
  readonly span: Span
}

// The verdict for one checked column of one row.
type CellDiff = {
  readonly column: string   // 'score'
  readonly span: Span       // source range of the cell text in the .var.md
  readonly expected: string // the cell text, e.g. "9"
  readonly actual: string   // String(returned value), e.g. "6"
  readonly ok: boolean
}

// Thrown by the core when a row's returned columns don't all match. Carries the
// structured diffs so adapters render/record without re-deriving anything.
class RowMismatchError extends Error {
  readonly cells: ReadonlyArray<CellDiff> // the mismatches (ok === false)
}
export function isRowMismatchError(e: unknown): e is RowMismatchError
```

The planner (already iterating a header-bound table's rows) attaches per-row
check data to each row's `PlannedExample`:

```ts
type RowCheck = { readonly column: string; readonly value: string; readonly span: Span }
// PlannedExample gains:
readonly rowChecks?: ReadonlyArray<RowCheck> // built from header.cells × row.cells × row.cellSpans
```

## Comparison semantics (pure `compareRow`)

```ts
function compareRow(
  returned: unknown,
  checks: ReadonlyArray<RowCheck>,
): ReadonlyArray<CellDiff>
```

- For each `check` whose `column` is a key of `returned`, emit a `CellDiff` with
  `expected = check.value`, `actual = String(returned[column])`,
  `ok = expected === actual`.
- Columns **not** returned are inputs — never checked, no `CellDiff`.
- `returned` that is `undefined` or not an object → no checks → empty result
  (the row passes; the step asserted nothing).
- The error message is derived for humans: `score: expected 9 but was 6`.

## Execution flow (`execute.ts`)

`executePlan` already runs each row example's single step. Change:

1. Capture the step handler's return value (today it's ignored).
2. If the example has `rowChecks`, run `compareRow(returned, rowChecks)`.
3. If any `CellDiff.ok === false`, throw `RowMismatchError(mismatches)`.

A row step that **throws** instead of returning fails opaquely as today (no
`CellDiff`) — return-based is the clean path, throwing still works. The pure
comparison is the core's job; the throw is the failure signal adapters already
understand (a thrown error from `run()` = failed example).

## Architecture

| Layer | Owns |
|-------|------|
| Core `@oselvar/var` | `Row.cellSpans`; `compareRow`; `CellDiff`; `RowMismatchError`; executePlan wiring. No `fs`, no `vitest`, no diff lib. |
| Ports / result | The failure surfaced to the sink carries `CellDiff[]` (via `RowMismatchError`). |
| Adapters | **Browser:** map `CellDiff` spans to editor decorations and render `~~expected~~actual`. **Later — var-vitest:** write `.var/<spec>.json`; **accept:** call a pure `applyAccepted(source, span, actual) → string` and write the file / dispatch the edit. |

## Phasing

- **Phase 1 — core (shippable alone).** `cellSpans`, `compareRow`, `CellDiff`,
  `RowMismatchError`, executePlan wiring; switch the Yahtzee dogfood step from
  `throw` to `return { score: … }`; update the Tables reference doc's step
  snippet to the return form. The dogfood vitest test stays green with **zero
  adapter changes** (a mismatch throws → fails; a match passes). `var-vitest`
  needs no change because it only observes pass/fail.
- **Phase 2 — live `~~9~~6`.** The website's `run-types`/`run-spec` carry
  `CellDiff[]` out of the run (read from `RowMismatchError` via
  `isRowMismatchError`); `cm-run` adds, per mismatched cell: a strike-through
  `Decoration.mark` over the expected cell span, and a `Decoration.widget` after
  it showing the actual (styled as an insertion). No diff library — whole-cell.
- **Future (noted, not now).** A `var-vitest` reporter writing `.var/<spec>.json`
  from the same `CellDiff`s; snapshot-style **accept** (pure
  `applyAccepted` in core, write in the adapter); intra-value diffs via jsdiff in
  the renderer when cells/doc-strings get long.

## Testing (TDD order)

1. **`compareRow`** (core unit): exact match → all `ok`; one mismatch → one
   `CellDiff` with right `expected`/`actual`/`span`; multi-column return; a
   returned key that isn't a header → ignored; `undefined` return → empty.
2. **Parser**: a table `Row` exposes a `cellSpans` entry per cell whose range
   slices back to the trimmed cell text.
3. **Planner**: a header-bound row `PlannedExample` carries `rowChecks` with the
   right column/value/span per cell.
4. **`executePlan`**: a row whose returned column mismatches throws
   `RowMismatchError` carrying a `CellDiff` at the cell's span; a matching row
   passes; a throwing row still fails opaquely.
5. **Browser** (`run-spec`): a failed row surfaces `cells` on the result;
   `cm-run` test asserts the decoration ranges. Manual check for the visual.

## Out of scope / non-goals

- No diff library in v1, and never in the core.
- No `.var/` recorder or "accept" in this iteration (designed for, not built).
- No change to whole-table mode or non-table steps.
