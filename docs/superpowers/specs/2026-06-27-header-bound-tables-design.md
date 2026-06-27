# Header-bound tables (row iteration) + Yahtzee showcase

Date: 2026-06-27
Status: design, pending implementation (TDD)

## Why

The front page and playground currently lean on contrived examples (the hello
greeting, a library late-fee). They don't make a reader nod and think "I
understand this" and then realise the beautiful prose they're reading is *also*
a precise, runnable test.

We're replacing the headline example with **Yahtzee scoring** (the
[codingdojo Yahtzee kata](https://codingdojo.org/kata/Yahtzee/)): a familiar,
non-trivial domain where dice are the most concrete values imaginable and the
heart of the game — *the same five dice are worth wildly different things
depending on which box you score them in* — is exactly what makes concrete
values pop.

The most compelling demonstration on a **live** editor is surgical red/green:
edit one die and watch *only that row* break while the others stay green. That
requires per-row examples. A genuine Markdown data table consumed by one step
can't do that today — the whole table is one example, so any wrong cell reddens
all of it.

So this design introduces a small, opt-in grammar extension — **header-bound
tables** — that yields per-row examples while keeping the scorecard look, and
showcases it with Yahtzee across the front page, the playground, an executable
syntax reference, and the dogfood test suite.

## The feature: header-bound tables

### Today

A table attaches to the step matched in the paragraph immediately above it
(`structurer.ts` already appends a trailing table to that example's body;
`plan.ts` attaches it to the block's last step as `dataTable`). The handler is
invoked **once**, receiving the whole table as `ReadonlyArray<ReadonlyArray<string>>`
(header row first) as its last argument (`execute.ts`).

### New mode — triggered by prose, not by new markup

If the matched paragraph **names every header cell** of the table below it, the
table flips into **row mode**:

- The table expands to **one example per row**.
- The matched step's handler runs **once per row**, receiving a single object
  keyed by header cell → raw cell string, e.g.
  `{ dice: "3, 3, 3, 4, 4", category: "full house", score: "17" }`.

If any header cell is *not* named in the paragraph, nothing changes — the table
keeps today's whole-table behaviour. The opt-in *is* the prose naming its
columns; there is no new syntax.

```markdown
Each row lists the dice, the category they're scored in, and the score:

| dice          | category       | score |
| ------------- | -------------- | ----- |
| 3, 3, 3, 4, 4 | full house     | 17    |
| 3, 3, 3, 4, 4 | threes         | 9     |
| 3, 3, 3, 3, 3 | full house     | 0     |
| 3, 3, 3, 3, 3 | Yahtzee        | 50    |
| 1, 2, 3, 4, 5 | small straight | 15    |
```

The paragraph contains `dice`, `category`, and `score` (all three headers) and
matches a step → row mode → 5 examples.

### Contract

1. **Trigger.** Row mode engages when, for a table attached to a step:
   - every header cell text appears in the matched paragraph as a **whole word,
     case-sensitive** (the paragraph must contain the header text exactly), and
   - the paragraph matched **exactly one** step (no ambiguity), and
   - the table immediately follows it (adjacency already guaranteed by the
     structurer — no blank line, heading, or thematic break between).

   Otherwise: current whole-table behaviour.

2. **Per-row examples.** Each data row becomes its own `PlannedExample`. Six
   rows → six independent tests. This is what makes the live-editor magic work:
   editing one die reddens only that row.
   - The row examples **nest under the paragraph sentence** as a `describe`
     scope; each row is a test named by its cells joined with ` / `
     (e.g. `3, 3, 3, 4, 4 / full house / 17`).
   - The example's reported line(s), the failing line, and the injected
     clickable stack frame all point at the **row's** source span, not the
     paragraph's. (Today both come from `step.matchSpan`; in row mode the
     synthetic per-row step carries the row span.)

3. **Handler arguments.** The handler receives one object of **raw strings**,
   keyed by header cell. No custom-parameter-type coercion on cells — the step
   parses them itself (`Number(row.score)`, split the dice). The object arrives
   after any args the cucumber expression itself captured (for the Yahtzee
   paragraph: none).
   - Header cells are normalised to object keys verbatim (`dice`, `category`,
     `score`). Headers that aren't valid identifiers are still allowed —
     consumers index with `row["..."]`. (Yahtzee headers are clean
     identifiers.)

## The Yahtzee example

### Spec — `yahtzee.var.md`

```markdown
# Yahtzee

Five dice, one scorecard — and the same roll is worth wildly different things
depending on which box you score it in.

Each row lists the dice, the category they're scored in, and the score:

| dice          | category       | score |
| ------------- | -------------- | ----- |
| 3, 3, 3, 4, 4 | full house     | 17    |
| 3, 3, 3, 4, 4 | threes         | 9     |
| 3, 3, 3, 4, 4 | fours          | 8     |
| 3, 3, 3, 3, 3 | full house     | 0     |
| 3, 3, 3, 3, 3 | Yahtzee        | 50    |
| 1, 2, 3, 4, 5 | small straight | 15    |
```

The `3, 3, 3, 3, 3` rows carry the delightful gotcha — *five of a kind is not a
full house (0), but it is a Yahtzee worth 50*. The last row broadens past one
roll with a fixed-value straight.

### Steps — `yahtzee.steps.ts`

One step consumes each row; one pure `score()` implements the kata.

```ts
import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext(() => ({}))

step("Each row lists the dice, the category they're scored in, and the score:",
  (_ctx, row: { dice: string; category: string; score: string }) => {
    const dice = row.dice.split(',').map((d) => Number(d.trim()))
    const actual = score(dice, row.category)
    const expected = Number(row.score)
    if (actual !== expected) {
      throw new Error(
        `${row.dice} scored as ${row.category}: expected ${expected}, got ${actual}`,
      )
    }
  })

function score(dice: readonly number[], category: string): number {
  // ones..sixes, pair, two pairs, three/four of a kind,
  // small/large straight, full house, Yahtzee, chance — per the kata rules.
}
```

`score()` is a pure function over immutable data, consistent with the
architectural principles.

## Surfaces & TDD order

Build core-first, each step driven by a failing vitest test in the owning
package.

| # | Layer | File(s) | Change |
|---|-------|---------|--------|
| 1 | Core plan | `packages/var/src/plan.ts` (+ `ast.ts`/`plan.ts` types) | Detect a header-bound table; expand its step into one planned example per row, each carrying the row span and a `{header: cell}` row object as the handler's trailing arg. |
| 2 | Core exec | `packages/var/src/execute.ts` | Row-mode examples already arrive as ordinary `PlannedExample`s from the planner, so the executor stays simple — verify the per-row object reaches the handler and stack frames map to the row. |
| 3 | LSP refs | `packages/var-language` (match refs) | Emit parameter ranges for the header-cell words inside the matched paragraph (the binding columns), and optionally the table cells. |
| 4 | LSP tokens | `packages/var-lsp/src/semantic-tokens.ts` (+ test) | Paint those ranges as `parameter` tokens; today it already paints step `function` + `parameter` ranges, so this is additive. |
| 5 | Reference docs | `packages/website/src/content/docs/reference/*.mdx` | New `reference` area content (see below). Executable / dogfooded. |
| 6 | Website seed | `packages/website/src/lib/seed-files.ts` | Replace the hello seed with the Yahtzee spec + steps (playground). |
| 7 | Front page | `packages/website/src/pages/index.astro` | Embed a **live, markdown-only** editor seeded with the Yahtzee spec; the steps run invisibly (see below). |
| 8 | Dogfood | `docs/tutorial/04-yahtzee.var.md` + `steps/04-yahtzee.steps.ts` | The example is also a real passing test in the suite. |

### Front-page live editor, markdown only

`editor-mount.ts` already auto-runs (300 ms debounce) and paints pass/fail line
backgrounds — no run button. The front page shows **only** the spec editor; the
reader never sees the steps. The steps must still reach the runner.

`runSpecNow()` gathers step sources from mounted `.steps.ts` editors, and the
in-browser language server only highlights a spec when it has indexed the step
file. Both wants are met by mounting the steps editor **off-screen** (a wrapper
positioned at `left: -99999px`, kept in the DOM and measurable) rather than
hidden with `display: none`. The reader sees only the spec; the language server
still indexes the steps (so the spec is highlighted) and `runSpecNow()` still
picks the editor up (so it runs). No new mount plumbing.

(Also generalised the hardcoded `varPath: '/hello.var.md'` in `runSpecNow()` to
the mounted markdown URI, so the Yahtzee file name flows through.)

Implementation note: a Markdown table needs its delimiter row
(`| --- | --- |`) under the header, or the scanner reads the pipe lines as
paragraphs and no table (header-bound or otherwise) is recognised.

### Reference docs that dogfood Vár

The new `reference` area starts documenting spec syntax, and **the docs are
executable**: the examples are real Vár specs, run both in the page (via the
existing `FileEditor`/`Editor` doc components, pulling real step sources with
`?raw`) and in the test suite. "Your docs are your source," applied to the
syntax reference itself.

First reference page: **Tables** — covers both whole-table mode and the new
header-bound row mode, using the Yahtzee table as the worked, runnable example.
Frontmatter: `area: reference`, an `order`, title, description.

## Out of scope / non-goals

- No general Scenario-Outline revival, no `<placeholder>` interpolation in the
  paragraph. Row mode passes the row object; the prose names columns but does
  not template them.
- No per-cell custom-parameter-type coercion in row mode (raw strings only).
- No new keywords, tags, or hooks.

## Orphan-attachment diagnostic removed

A table or fenced code block that does not attach to a step used to raise an
`orphan-attachment` warning. That's wrong: a `.var.md` is documentation, and
documentation is full of tables and code blocks that aren't steps. The warning
also produced a false positive on the live front-page editor during the brief
window before the (off-screen) steps editor was indexed. The diagnostic — its
emission in `plan.ts`, the `orphanAttachment` factory, the `orphan-attachment`
code, and the public export — is removed. The structurer still records
unattached tables/fences on `VarDoc.orphanAttachments` (structural bookkeeping),
it just isn't a lint finding. (`ambiguous-match` remains the only diagnostic.)

## Resolved decisions

- Per-row **examples** (not N calls in one example) — required for surgical
  red/green and per-row names. (Confirmed with user.)
- Raw-string row object keyed by header. (Confirmed with user.)
- Trigger = paragraph names every header cell + single matched step.
  Whole-word, **case-sensitive** (confirmed with user). So a `dice` header
  matches the word `dice` in the prose but not `Dice` — author the paragraph to
  echo the header text exactly.
