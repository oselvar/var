# CLAUDE.md

Guidance for AI assistants working in this repo.

## Architectural principles (non-negotiable)

- **Immutable types.** All data types are `readonly` — no mutable fields, no in-place mutation. Use `ReadonlyArray<T>` and `ReadonlyMap<K, V>`. Updates produce a new value.
- **Pure functions everywhere they're possible.** Parsing, matching, planning, snippet generation, diagnostics: all pure. Given the same input, return the same output, with no side effects.
- **Functional core, imperative shell.** The core (`@oselvar/var`) is pure functions over immutable data. The shell — file I/O, module loading, test-runner integration, CLI prompts, terminal output — lives in the adapter packages (`var-vitest`, `var-node`, `var-bun`, `var-cli`) and is the *only* place side effects are allowed.
- **Hexagonal architecture.** The core defines ports (interfaces it depends on); adapters implement them. The core never imports from `node:fs`, `vitest`, `bun:test`, etc. — those are wired in at the edges.

Concretely:

| Layer       | Lives in                          | May do                                  | May NOT do                          |
|-------------|-----------------------------------|-----------------------------------------|-------------------------------------|
| Core domain | `packages/var/src/*`              | pure transformations over immutable AST | filesystem, network, globals, time  |
| Ports       | `packages/var/src/ports.ts`       | declare interfaces                      | implement them                      |
| Adapters    | `packages/var-*/src/*`            | implement ports; talk to runtime APIs   | leak runtime types into the core    |

If a function in `packages/var/src/` needs to read a file, it doesn't — it takes the bytes as an argument. If the matcher needs the current time, it doesn't — the caller passes it in.

## Stack

pnpm workspace · biome · vitest (for the core's own tests) · knip · jscpd · TypeScript (ESM-only, `node:` imports, Node ≥ 22 LTS).

## Workflow

- **Trunk-based development.** We commit small, working increments straight to `main` — no long-lived feature branches. Keep each commit self-contained and green (build + tests pass), so trunk is always releasable.
- **Type-check is a separate gate.** vitest runs source through esbuild/tsx, which strips types without checking them — a fully green suite can still fail `tsc`. Run `pnpm -r build` (exit 0) before calling any change done, especially after touching a shared type, an AST node, or a package's public exports (new required fields and new exports are the usual culprits). The website has its own Astro build: `pnpm --filter @oselvar/website build`.
  - `pnpm -r build` only type-checks each package's `src/` (its `tsconfig.json` emits with `rootDir: src`). **Test files (`tests/**`) are type-checked by `pnpm typecheck`** (root `tsconfig.tests.json`, `noEmit`, covers every non-website package's `tests/`). It's part of `pnpm check`, so run `pnpm check` (or `pnpm typecheck` alone) after touching tests — a green vitest run does *not* mean the tests type-check. Note `expectTypeOf` assertions are validated here by `tsc`, not by vitest (we don't run `vitest --typecheck`).
- **Dogfood specs** in `docs/tutorial/**` (`*.var.md` + `*.steps.ts`) run via `NODE_OPTIONS="--import tsx" npx vitest run`; `var.config.ts` globs them.

## Conventions

- Test files in the project's own test suite: `*.test.ts` (vitest).
- BDD example files (dogfood + docs): `*.var.md`.
- Step definition files: `*.steps.ts`.
- Config: `var.config.ts` at repo root.

## Return-based comparison

A step may `return` a value; the pure core compares it against what the Markdown says and fails with span-anchored errors:

- **header-bound table row** — the step returns its computed columns; compared cell-by-cell → `CellMismatchError` (`CellDiff[]`, each with a source `span` + `expected` + `actual`).
- **whole table** — the step returns the full reproduced table; exact string compare per cell → `CellMismatchError`.
- **doc string** — the step returns the exact text (including the trailing `\n`); exact equality → `DocStringMismatchError`.
- **wrong shape/type** → `ReturnShapeError`; **`undefined` return** → pass (no assertion).

Because the diffs are anchored to source spans (`startOffset`/`endOffset`), editors render them directly (the website CodeMirror reddens the failing source span and shows `actual: …` on hover). These diffs are the basis of the emerging shared run-result format consumed by the editor, the LSP, and future HTML overlays.

## What's intentionally absent

- No `Given`/`When`/`Then` named exports — three role functions (`context`/`action`/`sensor`, bound via `defineState`) chosen by what a step does, not by a keyword. Keywords are author-side narration, never matched.
- No lifecycle hooks in the BDD layer — use the adapter's native `beforeEach`/`afterEach`.
- No tags in v1.
- No Gherkin AST, no `cucumber-messages`. The parser emits its own minimal immutable AST.
