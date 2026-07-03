# CLAUDE.md

Guidance for AI assistants working in this repo.

## Repository layout

This is a multi-language monorepo (ADR 0001). Top level:

- `typescript/` — the pnpm workspace (pure core `@oselvar/var`, runtime, vitest
  adapter, **and** the shared authoring/LSP/VS Code/website platform). **Run all
  pnpm / vitest / tsc commands from `typescript/`.** Package paths in this file
  (e.g. `packages/var/src/...`) are relative to `typescript/`.
- `python/` — the uv workspace for the Python port (skeleton today; see issue #2).
- `java/` — the Maven multi-module workspace for the Java port (JDK 21, pinned in
  `java/.tool-versions`).
- `conformance/` — language-neutral corpus (`bundles/<n>/{example.md, *.steps.ts,
  golden/*.json}`) read by every language's conformance harness.
- `docs/`, `doc/` — shared design docs (ADRs, specs, plans, ARCHITECTURE).

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

- **Root gate.** `make check` (or plain `make`) at the repo root builds and tests
  all three ports; `make typescript` / `make python` / `make java` run one. Each
  target runs the same commands as that port's CI workflow in `.github/workflows/`
  (`typescript.yml`, `python.yml`, `java.yml` — all three also trigger on
  `conformance/**`).
- **Trunk-based development.** We commit small, working increments straight to `main` — no long-lived feature branches. Keep each commit self-contained and green (build + tests pass), so trunk is always releasable.
- **Type-check is a separate gate.** vitest runs source through esbuild/tsx, which strips types without checking them — a fully green suite can still fail `tsc`. Run `pnpm -r build` (exit 0) before calling any change done, especially after touching a shared type, an AST node, or a package's public exports (new required fields and new exports are the usual culprits). Note `pnpm build` excludes both website packages — the Starlight website is built (and deployed to https://var.oselvar.com) only by the `deploy-website` CI job via `pnpm --filter @oselvar/website... build`; the legacy `packages/website` is never built. To check the website locally: `pnpm --filter @oselvar/website build`.
  - `pnpm -r build` only type-checks each package's `src/` (its `tsconfig.json` emits with `rootDir: src`). **Test files (`tests/**`) are type-checked by `pnpm typecheck`** (root `tsconfig.tests.json`, `noEmit`, covers every non-website package's `tests/`). It's part of `pnpm check`, so run `pnpm check` (or `pnpm typecheck` alone) after touching tests — a green vitest run does *not* mean the tests type-check. Note `expectTypeOf` assertions are validated here by `tsc`, not by vitest (we don't run `vitest --typecheck`).
- **Dogfood specs** in `packages/var-examples/**` (one directory per example, each with a `*.md` spec + its `*.steps.ts`) run via `NODE_OPTIONS="--import tsx" npx vitest run`; `var.config.json` globs them.

## Commit messages & changelog

CHANGELOG.md and the next release's version number are **generated from commit
messages** (git-cliff, `cliff.toml`) — there is no manual changelog step, and
`release/release.sh` takes no version argument. That works only if every
commit follows this convention (`make check` runs `release/lint-commits.sh`
on everything since the last release tag):

- **Format:** [Conventional Commits](https://www.conventionalcommits.org) —
  `type(scope): subject`. Types: `feat` / `fix` / `perf` are consumer-visible
  (they appear in the changelog and bump the version); `chore`, `docs`,
  `refactor`, `test`, `build`, `ci`, `style`, `revert` are not.
- **Scope names the consumer.** `feat`/`fix`/`perf` (and anything breaking)
  must be scoped `ts`, `py`, `java`, `vscode`, or `spec`, optionally
  `/package`: `feat(ts/var-vitest): …`, `fix(py/var-core): …`,
  `refactor(java/var-junit)!: …`. The scope decides which changelog section
  the entry lands in (npm / PyPI / Maven Central / VS Code / all ports).
  Work that ships nothing to a consumer — website, CI, tooling — is a
  `chore(website): …` or similar, never a `feat`: it would bump the version
  while appearing in no changelog section.
- **The subject is the changelog line, verbatim.** Write it for the consumer
  reading release notes, not the reviewer reading the diff: what changed for
  *them*, not how. "generated modules import runtime helpers from
  @oselvar/var-vitest/runtime", not "refactor virtual module codegen".
- **Breaking changes:** append `!` to the type and add a
  `BREAKING CHANGE: <consumer-facing migration note>` footer — the note is
  rendered in the changelog under the entry.
- **Versioning is automatic and 0.x-aware:** while on 0.x, a breaking change
  bumps *minor* and everything else bumps *patch* (matching npm's `^0.x`
  caret). 1.0.0 is never inferred — it happens only when a human passes it
  explicitly to `release/release.sh`.
- Never edit CHANGELOG.md by hand — regenerate with `make changelog`. CI
  (`.github/workflows/changelog.yml`) refreshes the `[Unreleased]` section on
  every push to `main`; `release/release.sh` folds it into the release's
  section at release time.

## Conventions

- Test files in the project's own test suite: `*.test.ts` (vitest).
- BDD example files (dogfood + docs): plain `*.md`. There is no special `.var.md`
  extension — a file is a spec iff its path matches the `docs` globs in `var.config.json`.
  `docs` is `{ include, exclude }` (canonical shape — no array shorthand); both
  are plain globs, no `!` prefix. `include` has no default (empty discovers nothing);
  `exclude` removes matches (e.g. a not-implemented tutorial exercise). That config is
  the single source of truth for "what is a spec", consulted by the runner, the LSP, and
  the vitest plugin alike — the plugin drives vitest's own `include`/`exclude` from it.
- Step definition files: `*.steps.ts`.
- Config: `var.config.json` at the `typescript/` workspace root.

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
