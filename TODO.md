# TODO

## Refactoring (LSP)

- [ ] Rename a parameter type (e.g. `{airport}` → `{iata}`): cascade to the
      `defineParameterType({ name: ... })` call, every step expression that uses
      `{name}`, and every matched .bdd.md site. Mirrors what F2 step rename
      already does for cucumber expressions.
- [ ] F2 polish: surface malformed-new-expression errors inline; offer a
      preview of sites that would become unmatched before applying.

## VSCode extension

- [ ] Code Lens "➜ N references" above each `step('…')` with click-to-jump
      back to every matched .bdd.md caller.
- [ ] Find References (reverse): from a step def → all matched .bdd.md sites.
- [ ] Package .vsix and publish to the VSCode Marketplace + Open VSX.

## Runtime adapters & CI

- [ ] `@oselvar/bdd-bun` adapter (parallel to `bdd-vitest`).
- [ ] `@oselvar/bdd-deno` adapter.
- [ ] CI matrix: node + bun + deno.

## CLI

- [ ] `bdd lint` should load step files (via `buildWorkspaceIndex`) so it can
      detect `ambiguous-match` end-to-end, not just `orphan-attachment`.
- [ ] `bdd lint` async `glob` crashes on symlinks (Node 22 bug). Run.ts already
      switched to `globSync`; lint.ts and the LSP store still use the buggy
      `node:fs/promises.glob`. Hoist together with the findFiles cleanup.
- [ ] `bdd run` Phase 2 polish: colors, file grouping summary, `--quiet`.
- [ ] Cucumber-js compatible API (just change imports).
  - [ ] CLI codemod for migrating from Cucumber.
- [ ] `bdd-cli` build is broken (TS6 can't resolve `node:fs` without
      `@types/node`). Cucumber's `test:bdd` invokes `node ../bdd-cli/src/bin.ts
      run` via tsx as a workaround — once the build is fixed, switch back to
      the `bdd` bin.

## Code quality

- [ ] Hoist the `findFiles` helper (duplicated across
      `packages/bdd-vitest/src/plugin.ts`, `packages/bdd-cli/src/lint.ts`,
      `packages/bdd-cli/src/run.ts`, and `packages/bdd-lsp/src/store.ts`)
      into a shared utility — and standardise on `globSync`.
- [ ] Move tests next to source

## Markdown

- [ ] <!-- @foo --> support tags

## Reporting

- [ ] Generate HTML from markdown and runner results (vitest JSON)

## Performance

- [ ] Vitest runner
- [x] CLI runner (`bdd run`): ~0.74 s wall on the cucumber sample, ~2× faster
      than the vitest path (~1.5 s) and slightly faster than cucumber-js
      (~0.85 s). See `packages/cucumber/README.md`.
- [x] Cucumber.js comparison documented in `packages/cucumber/README.md`

## Open questions

- [ ] Can we somehow represent rules and link examples to them? Is it useful?
- [ ] Tags? v1 deliberately omits them — revisit if user demand appears.
