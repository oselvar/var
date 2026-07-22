---
title: Run your existing .feature files
description: Point Varar at your Cucumber .feature files and run them unchanged, with only the step definitions ported.
---

Varar can run your existing Gherkin `.feature` files **without editing them**.
You port the step definitions; the feature files stay exactly as they are, still
readable by cucumber if you want to keep both running side by side during a
migration.

This guide assumes Varar is already installed. If not, start with
[Get started on your computer](/tutorials/get-started/).

## 1. Point the config at your features

A file is a spec because it matches the `docs.include` globs — not because of
its extension. So name your `.feature` files directly, and turn on the two
scanner plugins that teach the parser Gherkin's table and doc-string syntax:

```json
{
  "docs": { "include": ["features/**/*.feature"], "exclude": [] },
  "steps": ["steps/**/*.steps.ts"],
  "scannerPlugins": ["gherkinTables", "gherkinDocStrings"]
}
```

Without `gherkinTables`, Gherkin's separator-less `| … |` rows are not
recognised as a table (Markdown requires a `|---|` row); without
`gherkinDocStrings`, `"""` blocks are not recognised as doc strings. A
misspelled plugin name fails loudly rather than silently doing nothing. See
[varar.config.json](/reference/configuration/#scannerplugins).

## 2. Port the step definitions

This is the only part you rewrite. Replace cucumber's keyword registrations with
the role that matches what the step *does*:

```ts
// before (cucumber-js)
Given('the library has these books:', function (table) { … })
When('the member borrows {string}', function (title) { … })
Then('the receipt is:', function (doc) { … })

// after (varar)
const { stimulus, sensor } = steps(() => ({ … }))

stimulus('the library has these books:', (state, table) => ({ …state, books: table }))
stimulus('the member borrows {string}', (state, title) => ({ …state, receipt: borrow(state, title) }))
sensor('the receipt is:', (state, doc) => JSON.stringify(state.receipt))
```

- There are only **two** roles. `Given`/`When` both become `stimulus`; `Then`
  becomes `sensor`. See [Stimuli](/reference/stimuli/) and
  [Sensors](/reference/sensors/).
- `World` plus `Before`/`After` become the `steps(() => …)` state factory, whose
  value arrives as each handler's first argument. A stimulus returns the
  **complete next state**.
- Data tables arrive as `string[][]` with the header row first; doc strings as a
  `string`. Both are the **last** handler argument, after whatever the
  expression captured.
- Your cucumber expressions (`{string}`, `{int}`, …) work unchanged.

## 3. Run

```bash
npx varar run
```

…or through vitest — see [Run specs through vitest](/how-to/run-with-vitest/).

## How your Gherkin is read

Varar has no Gherkin parser. It reads the file as prose and matches sentences,
which is why the syntax survives:

- `Feature:` and `Rule:` lines match no step, so they are **prose** — narration,
  ignored.
- `Given` / `When` / `Then` / `And` / `But` are narration too. Keywords are never
  matched; your expression matches the rest of the line.
- Each `Scenario:` / `Example:` block is one paragraph (its step lines are
  contiguous), and a paragraph with matching steps is **one Varar example**.
- Indented tables and `"""` blocks attach to the step above them, exactly as in
  cucumber.

## Two things that do change

**`Background:` has no equivalent.** It is separated by a blank line, so it
becomes its *own* example with its *own* fresh state rather than running before
each scenario. Inline its steps into each scenario that needs them.

**Example names are the whole paragraph.** A scenario is named after all of its
text, so it comes out as
`Scenario: An available book is borrowed Given the library has these books:`
rather than just the scenario title. Any `vitest -t "<scenario name>"` filtering
you rely on needs updating.

**There is no undefined-step report.** A sentence that matches nothing is prose
*by design*, so `varar lint` will not list it the way `cucumber --dry-run`
does. The case that actually loses coverage — a paragraph that *used* to match
and no longer does — is caught by
[drift detection](/reference/examples/#drift-detection) instead, which fails the
run rather than printing a warning.

## Next

- [Varar for Cucumber users](/explanation/var-for-cucumber-users/) — why the
  model is different, not just the syntax.
