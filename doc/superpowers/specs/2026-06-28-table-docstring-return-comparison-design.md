# Return-based comparison for whole-table and doc-string steps

Date: 2026-06-28
Status: design, pending implementation (TDD). **Phase 2** — builds directly on
the Phase 1 cell-diff core ([2026-06-28-cell-diff-design.md](2026-06-28-cell-diff-design.md)).

## Why

Phase 1 lets a *header-bound row* step return its computed columns and have the
core diff them against the row's cells. The same idea generalizes to the other
two ways data reaches a step:

- A **whole-table** step (one that receives the table as `string[][]`) can
  **return a table**; the core compares it against the input table.
- A **doc-string** step can **return a string**; the core compares it against
  the input doc string.

This makes "the prose IS the assertion" hold for every step shape, not just
header-bound rows — and because Phase 1's Task 1 gave *every* table per-cell
source spans (`Row.cellSpans`), a whole-table mismatch can point at the exact
failing cell with zero extra machinery.

## Resolved decisions

- **Exact string comparison.** `String(returned) === cellText` per cell;
  `returned === content` for doc strings. No type coercion, no normalization —
  identical to the Phase 1 rule. The author returns values whose `String()`
  matches, or exact strings.
- **Whole table = full reproduction.** A returned table must contain **every**
  column of **every** data row; all cells are checked. There is no "input
  column" concept here (that selective behavior stays unique to Phase 1
  header-bound rows). Partial or wrong-shape returns are failures.
- **Doc string = exact equality.** Byte-for-byte; a stray trailing newline is a
  real difference.
- **One cell-diff error for rows and tables.** Phase 1's planned
  `RowMismatchError` is **renamed `CellMismatchError`** and carries
  `CellDiff[]` for both header rows and whole tables. (Phase 1 Tasks 2–5 are not
  built yet, so this is a free rename — see *Effect on the Phase 1 plan*.)
- **`undefined` return = pass.** A step that returns nothing asserted nothing,
  for tables and doc strings just as for rows.
- **Editor presentation: red cell + hover-actual.** In the editor (CodeMirror
  and VSCode), a failing cell's text is shown **in red**, and **hovering it
  shows the actual value** the step returned. This supersedes the inline
  `~~expected~~actual` strike/insert sketch from Phase 1 as the editor surface.

## Core data model (pure, `@oselvar/var`)

Reuses Phase 1's `CellDiff` and `Row.cellSpans` verbatim. Adds:

```ts
// Value differences with cell granularity — for BOTH header rows and whole
// tables. (Phase 1's RowMismatchError, renamed and broadened.)
class CellMismatchError extends Error {
  readonly cells: ReadonlyArray<CellDiff> // the mismatches (ok === false)
}
export function isCellMismatchError(e: unknown): e is CellMismatchError

// A doc-string content difference.
type DocStringDiff = {
  readonly span: Span       // the fence body's source range in the .var.md
  readonly expected: string // the doc-string content
  readonly actual: string   // the returned string
}
class DocStringMismatchError extends Error {
  readonly diff: DocStringDiff
}
export function isDocStringMismatchError(e: unknown): e is DocStringMismatchError

// The step returned the wrong TYPE (string where a table was input, a
// non-array, …) or wrong SHAPE (row/column count, missing record key). An
// author mistake, not a value diff — carries a clear human message only.
class ReturnShapeError extends Error {}
```

These live in the same comparison module as Phase 1's `compareRow`/`CellDiff`
(the Phase 1 plan's `row-diff.ts` is renamed `cell-diff.ts` to fit its broadened
role; doc-string helpers may sit in a sibling `doc-string-diff.ts`).

The AST already carries what the comparison needs:
- `Table { header: Row; rows: ReadonlyArray<Row> }`, each `Row` with
  `cells` + `cellSpans` (Phase 1 Task 1).
- The doc-string fence: `executePlan` passes `fence.body` to the handler today;
  the planner will also surface the body's **content span** so a
  `DocStringDiff` can point at it. (`Fence` already has a `span`; the comparison
  needs the body's range — added alongside, mirroring how rows expose
  `cellSpans`.)

## Comparison semantics (pure)

```ts
function compareTable(returned: unknown, input: Table): ReadonlyArray<CellDiff>
function compareDocString(returned: unknown, content: string, span: Span): DocStringDiff | null
```

**`compareTable`:**
1. `returned === undefined` → `[]` (pass; asserted nothing).
2. `returned` is **not an array** → throw `ReturnShapeError` ("expected a table,
   got …").
3. Determine row form from the elements (must be uniform):
   - every element is an **array** → *array-of-arrays*. Each row's width must
     equal `input.header.cells.length`; otherwise `ReturnShapeError`.
   - every element is a **plain object** → *array-of-records*. Each record must
     contain **every** key in `input.header.cells`; a missing key is a
     `ReturnShapeError`. **Extra** keys (not in the header) are ignored — only
     header columns are compared. Records require **unique** header names; a
     table with duplicate header cells can only be checked via array-of-arrays.
   - mixed / neither → `ReturnShapeError`.
4. Row count must equal `input.rows.length` (the data rows; the header is
   labels, never compared); otherwise `ReturnShapeError`.
5. Per cell `(i, j)`: `actual = String(returnedCell)`,
   `expected = input.rows[i].cells[j]`, `span = input.rows[i].cellSpans[j]`,
   `ok = actual === expected`. Emit a `CellDiff` for every cell (the renderer
   keeps only `ok === false`, consistent with Phase 1).

**`compareDocString`:**
1. `returned === undefined` → `null` (pass).
2. `typeof returned !== 'string'` → throw `ReturnShapeError`.
3. `returned === content` → `null`; else `{ span, expected: content, actual: returned }`.

## Execution flow (`execute.ts`)

`executePlan` already (in Phase 1) captures each handler's return value. After
the step loop, it branches on what the step received — **exactly one** of these
applies per example:

1. `ex.rowChecks` present → `compareRow` → `CellMismatchError` on mismatch *(Phase 1)*.
2. else the step has a `dataTable` → `compareTable(returned, dataTable)`; if any
   `CellDiff.ok === false` → throw `CellMismatchError(badCells)`.
3. else the step has a `docString` → `compareDocString(returned, content, span)`;
   non-null → throw `DocStringMismatchError(diff)`.
4. else → ignore the return.

`compareTable`/`compareDocString` may also throw `ReturnShapeError`; that
propagates as the example's failure. All thrown errors get the existing
synthetic stack frame (`augmentStack`) so the `.var.md:line` stays clickable —
for tables the frame points at the table/step line; the structured `cells` /
`diff` ride on the error for adapters.

A step that **throws** instead of returning still fails opaquely, as today.

## Editor presentation (adapters)

The core emits `(span, expected, actual)` per failing cell and `(span,
expected, actual)` for a doc string. Rendering is the adapter's job:

- **CodeMirror (website/playground) — first target.** Specs already auto-run in
  the browser on every edit; the run result gains `CellDiff[]` /
  `DocStringDiff`. `cm-run` adds, per failing cell: a `Decoration.mark` that
  colors the cell text **red**, plus a `hoverTooltip` over the cell span showing
  the **actual** returned value. Doc-string diffs color the body span red with
  the same hover. Reuses Phase 1's renderer path; no diff library.
- **VSCode.** Same presentation — a red range with the actual value on hover,
  naturally expressed as a diagnostic on the cell range whose message carries
  the actual value. This requires run results to reach the editor, which the
  static LSP does not do today; wiring that channel (LSP-run capability or a
  test-adapter decoration feed) is a **separate effort**, noted here, not
  designed in this spec. The core signal it will consume is the same `CellDiff`.

Intra-value diffs (jsdiff for long doc strings) remain a future adapter
refinement and never enter the core.

## Architecture

| Layer | Owns |
|-------|------|
| Core `@oselvar/var` | `compareTable`; `compareDocString`; `CellMismatchError`; `DocStringMismatchError`; `ReturnShapeError`; doc-string body span on the plan; executePlan branching. No `fs`, no `vitest`, no diff lib. |
| Result / ports | The failure carries `CellDiff[]` (`CellMismatchError`) or `DocStringDiff` (`DocStringMismatchError`). |
| Adapters | **CodeMirror:** red cell decoration + hover-actual tooltip from `CellDiff`/`DocStringDiff`. **VSCode:** same, once a run-results channel exists (separate effort). |

## Effect on the Phase 1 plan

Phase 1 (`2026-06-28-cell-diff-phase-1.md`, Tasks 2–5 not yet implemented) is
adjusted, not redone:
- `row-diff.ts` → `cell-diff.ts`; `RowMismatchError` → `CellMismatchError`;
  `isRowMismatchError` → `isCellMismatchError`. Same shapes.
- No change to Task 1 (already shipped) or to `compareRow`'s behavior.

These renames fold into Phase 1 execution when its remaining tasks run; Phase 2
is planned and built **after** Phase 1 Tasks 2–5 land.

## Phasing

- **Phase 2a — core (shippable alone).** Doc-string body span on the plan;
  `compareTable`; `compareDocString`; `CellMismatchError` (generalized);
  `DocStringMismatchError`; `ReturnShapeError`; executePlan branches 2–3. A
  dogfood `.var.md` + steps exercising a whole-table return and a doc-string
  return, green via `return`. Reference docs (Tables, a new Doc strings page)
  updated to the return form. Zero adapter changes required for green.
- **Phase 2b — CodeMirror red cell + hover-actual.** Run result carries
  `CellDiff[]`/`DocStringDiff`; `cm-run` paints red + hover.
- **Future.** VSCode run-results channel; jsdiff intra-value diffs in the
  renderer.

## Testing (TDD order)

1. **`compareTable`** (core unit): full match → all `ok`; one bad cell → one
   `CellDiff` with right `expected`/`actual`/`span`; array-of-records and
   array-of-arrays both work; missing record key / wrong width / wrong row count
   / non-array / mixed elements each throw `ReturnShapeError`; `undefined` → `[]`.
2. **`compareDocString`** (core unit): equal → `null`; differ → `DocStringDiff`
   with the body span; non-string → `ReturnShapeError`; `undefined` → `null`.
3. **Planner**: a doc-string step's plan carries the body's content span.
4. **`executePlan`**: a whole-table step whose returned table mismatches throws
   `CellMismatchError` with a `CellDiff` at the cell's span; a matching table
   passes; a doc-string mismatch throws `DocStringMismatchError`; a shape/type
   error throws `ReturnShapeError`; `undefined` passes.
5. **Dogfood**: a `.var.md` whole-table example + a doc-string example stay
   green using `return`.
6. **CodeMirror** (Phase 2b): run result surfaces `cells`/`diff`; `cm-run`
   decoration test asserts the red mark ranges and the hover content.

## Out of scope / non-goals

- No type coercion, no normalization (decided: exact string compare).
- No diff library in v1, never in the core.
- No VSCode run-results plumbing in this spec (separate effort).
- No change to whole-table *input* behavior (the `string[][]` a step receives is
  unchanged) or to non-table/non-docstring steps.
