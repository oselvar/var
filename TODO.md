# TODO

> Repo is now multi-language: `packages/...` paths below are relative to the
> `typescript/` workspace (see CLAUDE.md → Repository layout).

## Platforms
- [ ] .NET
- [ ] Go

## Docs

- [ ] How to generate step functions
- [ ] Vocab
  - [ ] port -> platform
  - [ ] step definition -> step function
  - [ ] examples -> tests (let's not be pedantic - use established vocabulary)
  - [ ] spec -> depends....

## Website

- [x] Simpler frontpage
- [x] Use tailwindcss
- [x] Remove @navikt/ds-css
- [x] Tabs for examples on front page and tutorial
- [ ] Prerender all editors
- [ ] Nicer frontpage - inspiration:
  - [ ] https://www.kaggle.com/
  - [ ] https://www.val.town/
  - [ ] https://fly.io/

## Terminiology
- [ ] Oath: an .md doc with 1 or more examples
- [x] Example: A paragraph with a matching step definition
- [x] Sensor: A step definition that returns an actual value from the system
- [ ] Input: A step definition that interacts with the system

## Refactoring (LSP)

- [ ] Rename a parameter type (e.g. `{airport}` → `{iata}`): cascade to the
      `defineParameterType({ name: ... })` call, every step expression that uses
      `{name}`, and every matched .md site. Mirrors what F2 step rename
      already does for cucumber expressions.
- [ ] Rename stepdef (only a param) -> Fails to rename
- [ ] F2 polish: surface malformed-new-expression errors inline; offer a
      preview of sites that would become unmatched before applying.

## VSCode extension

- [ ] Code Lens "➜ N references" above each `step('…')` with click-to-jump
      back to every matched .md caller.
- [ ] Find References (reverse): from a step def → all matched .md sites.
- [x] Package .vsix and publish to the VSCode Marketplace + Open VSX.
- [x] Run button for each example.
- [ ] Mention it in the docs

## Runtime adapters & CI

- [ ] `@oselvar/var-bun` adapter (parallel to `var-vitest`).
- [ ] `@oselvar/var-deno` adapter.
- [ ] CI matrix: node + bun + deno.

## CLI

- [ ] `var lint` should load step files (via `buildWorkspaceIndex`) so it can
      detect `ambiguous-match` end-to-end, not just `orphan-attachment`.
- [ ] `var lint` async `glob` crashes on symlinks (Node 22 bug). Run.ts already
      switched to `globSync`; lint.ts and the LSP store still use the buggy
      `node:fs/promises.glob`. Hoist together with the findFiles cleanup.
- [ ] `var run` Phase 2 polish: colors, file grouping summary, `--quiet`.
  - [ ] CellMismatchError: arg 1: expected "Hello, world!" but was Hello, worlsd!
    - [ ] Quotes
    - [ ] arg 1
- [ ] Cucumber-js compatible API (just change imports).
  - [ ] CLI codemod for migrating from Cucumber.
- [ ] `var-cli` build is broken (TS6 can't resolve `node:fs` without
      `@types/node`). Cucumber's `test:var` invokes `node ../var-cli/src/bin.ts
      run` (Node runs the TS source natively) as a workaround — once the build
      is fixed, switch back to the `var` bin.

## Code quality

- [x] Hoist the `findFiles` helper (duplicated across
      `packages/var-vitest/src/plugin.ts`, `packages/var-cli/src/lint.ts`,
      `packages/var-cli/src/run.ts`, and `packages/var-lsp/src/store.ts`)
      into a shared utility — and standardise on `globSync`.
- [ ] Move tests next to source
- [ ] Move packages/var/tests/conformance.test.ts

## Markdown

- [ ] <!-- @foo --> support tags

## Reporting

- [ ] Generate HTML from markdown and runner results (vitest JSON)

## Runner

- [x] Vitest runner
- [x] CLI runner (`var run`): ~0.74 s wall on the cucumber sample, ~2× faster
      than the vitest path (~1.5 s) and slightly faster than cucumber-js
      (~0.85 s). See `packages/cucumber/README.md`.
- [x] Cucumber.js comparison documented in `packages/cucumber/README.md`

## Open questions

- [ ] Can we somehow represent rules and link examples to them? Is it useful?
- [ ] Tags? v1 deliberately omits them — revisit if user demand appears.
