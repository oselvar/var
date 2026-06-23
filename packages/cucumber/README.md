# @oselvar/cucumber

A migration-verification sandbox: one Gherkin feature file, two step-definition
implementations, three test runners — proving that the same business behavior
runs under both `cucumber-js` and `@oselvar/bdd`.

This package is **private** and never published. It exists to answer a single
question while we shape the public API: *can a project move from
cucumber-js to oselvar/bdd by porting only the step definitions?*

## Layout

```
features/
  library.feature              real Gherkin, owned by cucumber-js
  library.feature.bdd.md  ->   symlink to library.feature, parsed by bdd

cucumber/steps/library.steps.ts   cucumber-js handlers (Given/When/Then + hooks)
steps/library.steps.ts            bdd handlers (step + defineContext)

src/library.ts                    the shared domain (a tiny library catalogue)
```

Both runners exercise the same `src/library.ts`. The step definitions are
deliberately the same shape — only the imports and the registration calls
differ.

## Why a symlink

The `.feature` file is real Gherkin (`Feature:`, `Scenario:`, indented
`Given/When/Then`, `| ... |` table rows without a `|---|` separator, `"""`
doc strings). vitest's file matcher looks for `*.bdd.md`, so we symlink the
file under both names. Vite's `preserveSymlinks: true` keeps the extension
intact through the loader, so bdd sees a `.bdd.md` file whose contents are
Gherkin.

To make the bdd scanner understand Gherkin tables and doc strings the package
opts into two scanner plugins in `bdd.config.ts`:

```ts
import { gherkinDocStrings, gherkinTables } from '@oselvar/bdd'

export default {
  bdds: ['features/**/*.bdd.md'],
  steps: ['steps/**/*.steps.ts'],
  scannerPlugins: [gherkinTables(), gherkinDocStrings()],
}
```

Plugins are off by default in `@oselvar/bdd`; ordinary Markdown-native
`.bdd.md` files do not need them.

## Three runners

| Script | Runner | What it does |
|---|---|---|
| `pnpm test:cucumber` | cucumber-js | Loads `cucumber/steps/library.steps.ts`, runs `library.feature` |
| `pnpm test:bdd` | `@oselvar/bdd-cli` (`bdd run`) | Loads `steps/library.steps.ts`, runs `library.feature.bdd.md` |
| `pnpm test:bdd-vitest` | vitest + `@oselvar/bdd-vitest` plugin | Same .bdd.md, executed through vitest's runner |
| `pnpm test` | all three in sequence | full sweep |

All three run the same scenario green.

## Wall-clock comparison

Locally, one scenario / three steps, Node 22:

| Runner | Wall clock (mean of 3) |
|---|---|
| cucumber-js | ~0.85 s |
| `bdd run` (CLI) | ~0.74 s |
| `bdd` via vitest | ~1.5 s |

The vitest path pays the cost of spinning up vite's transform + worker
plumbing. The standalone CLI parses, plans, and executes the same .bdd.md
directly, with no test runner in the way — which is most of the gap.

## Migration path, summarised

1. Symlink (or rename) `.feature` to `.bdd.md`.
2. Add `gherkinTables()` and `gherkinDocStrings()` to `scannerPlugins` in
   `bdd.config.ts` so the existing Gherkin syntax parses unchanged.
3. Re-write the step file: replace
   `Given('expr', fn)` / `When(...)` / `Then(...)` with one shared
   `step('expr', fn)`, and replace `World` + `Before`/`After` with a
   `defineContext(() => ({...}))` factory whose return value flows into
   each handler as the first argument.
4. Data tables arrive as `ReadonlyArray<ReadonlyArray<string>>` (header row
   first); doc strings as `string`. Both are the LAST handler argument,
   after whatever the cucumber expression captured.

That is the whole list. The handlers themselves don't change.
