# CLAUDE.md

Guidance for AI assistants working in this repo.

## Repository layout

This is a multi-language monorepo (ADR 0001). Top level:

- `typescript/` — the pnpm workspace (pure core `@varar/varar`, runtime, vitest
  adapter, **and** the shared authoring/LSP/VS Code/website platform). **Run all
  pnpm / vitest / tsc commands from `typescript/`.** Package paths in this file
  (e.g. `packages/varar/src/...`) are relative to `typescript/`.
- `python/` — the uv workspace for the Python port (core, runner, pytest +
  unittest adapters).
- `java/` — the Maven multi-module workspace for the Java port (JDK pinned in the
  repo-root `.tool-versions`, alongside every other asdf toolchain; run
  `make install-tools` to install them all).
- `conformance/` — language-neutral corpus (`bundles/<n>/{example.md, *.steps.ts,
  golden/*.json}`) read by every language's conformance harness.
- `doc/` — shared design docs (ADRs, specs, plans, ARCHITECTURE).
- `examples/` — one standalone sample project per language/test-framework
  combo, mirroring the `varar-dev/varar-examples` repo 1:1 (synced there on every
  release by `release/targets/72-varar-examples.sh`). The `.md` specs sit at
  each project's root; `typescript-vitest` holds the originals, the other
  projects symlink their subset (the sync dereferences symlinks).

## Documentation

User-facing documentation follows [Diátaxis](https://diataxis.fr): every page is
one of **tutorial** (learning by doing), **how-to guide** (goal-oriented steps),
**reference** (facts, lookup), or **explanation** (understanding, background).
Decide the quadrant before writing and don't mix them in one page.

- User-facing docs live on the website:
  `typescript/packages/website/src/content/docs/{tutorials,how-to,reference,explanation}`.
  Published to https://varar.dev.
- Internal/design docs (ADRs, specs, plans, ARCHITECTURE) stay in `doc/` at
  the repo root — they are not part of the Diátaxis structure.

## Architectural principles (non-negotiable)

- **Immutable types.** All data types are `readonly` — no mutable fields, no in-place mutation. Use `ReadonlyArray<T>` and `ReadonlyMap<K, V>`. Updates produce a new value.
- **Pure functions everywhere they're possible.** Parsing, matching, planning, snippet generation, diagnostics: all pure. Given the same input, return the same output, with no side effects.
- **Functional core, imperative shell.** The core (`@varar/varar`) is pure functions over immutable data. The shell — file I/O, module loading, test-runner integration, CLI prompts, terminal output — lives in the adapter packages (`var-vitest`, `var-node`, `var-bun`, `var-cli`) and is the *only* place side effects are allowed.
- **Hexagonal architecture.** The core defines ports (interfaces it depends on); adapters implement them. The core never imports from `node:fs`, `vitest`, `bun:test`, etc. — those are wired in at the edges.

Concretely:

| Layer       | Lives in                          | May do                                  | May NOT do                          |
|-------------|-----------------------------------|-----------------------------------------|-------------------------------------|
| Core domain | `packages/varar/src/*`              | pure transformations over immutable AST | filesystem, network, globals, time  |
| Ports       | `packages/varar/src/ports.ts`       | declare interfaces                      | implement them                      |
| Adapters    | `packages/var-*/src/*`            | implement ports; talk to runtime APIs   | leak runtime types into the core    |

If a function in `packages/varar/src/` needs to read a file, it doesn't — it takes the bytes as an argument. If the matcher needs the current time, it doesn't — the caller passes it in.

## Stack

pnpm workspace · biome · vitest (for the core's own tests) · knip · jscpd · TypeScript (ESM-only, `node:` imports, Node ≥ 22 LTS).

## Workflow

- **Root gate.** `make check` (or plain `make`) at the repo root builds and tests
  all seven ports; `make typescript` / `make python` / `make java` / `make ruby` /
  `make rust` / `make dotnet` / `make go` run one (`java` covers Kotlin too).
  Each target runs the same commands as that port's CI workflow in
  `.github/workflows/` (`typescript.yml`, `python.yml`, `java.yml`, `ruby.yml`,
  `rust.yml`, `dotnet.yml`, `go.yml` — all also trigger on `conformance/**`).
- **Trunk-based development.** We commit small, working increments straight to `main` — no long-lived feature branches. Keep each commit self-contained and green (build + tests pass), so trunk is always releasable.
- **Type-check is a separate gate.** vitest runs source through esbuild/tsx, which strips types without checking them — a fully green suite can still fail `tsc`. Run `pnpm -r build` (exit 0) before calling any change done, especially after touching a shared type, an AST node, or a package's public exports (new required fields and new exports are the usual culprits). Note `pnpm build` and `pnpm check` both exclude the website packages — the Starlight website is built separately via `pnpm --filter @varar/website... build`, run in two CI places: the `test` job (a PR gate — its `<Editor>` components assert every port in `languages.json` has example files, so a forgotten port fails the build) and the `deploy-website` job (which also deploys to https://varar.dev). The legacy `packages/website` is never built. To check the website locally: `pnpm --filter @varar/website build`.
  - `pnpm -r build` only type-checks each package's `src/` (its `tsconfig.json` emits with `rootDir: src`). **Test files (`tests/**`) are type-checked by `pnpm typecheck`** (root `tsconfig.tests.json`, `noEmit`, covers every non-website package's `tests/`). It's part of `pnpm check`, so run `pnpm check` (or `pnpm typecheck` alone) after touching tests — a green vitest run does *not* mean the tests type-check. Note `expectTypeOf` assertions are validated here by `tsc`, not by vitest (we don't run `vitest --typecheck`).
- **Dogfood specs**: `examples/typescript-vitest` (package
  `@varar/example-typescript-vitest`, a pnpm workspace member via
  `../examples/typescript-vitest`, workspace deps, never released) holds the
  original `.md` specs at its root plus their `steps/*.steps.ts`, and runs in
  the root vitest workspace. The JVM samples consume the SNAPSHOT installed by
  `mvn install`; the Python samples use uv path sources.

## Commit messages & changelog

CHANGELOG.md and the next release's version number are **generated from commit
messages** (git-cliff, `cliff.toml`) — there is no manual changelog step. The
version is inferred at `make prepare` time (`release/release.sh` itself takes no
argument — it reads the prepared version from the manifests). That works only if
every commit follows this convention (`make check` runs `release/lint-commits.sh`
on everything since the last release tag):

- **Format:** [Conventional Commits](https://www.conventionalcommits.org) —
  `type(scope): subject`. Types: `feat` / `fix` / `perf` are consumer-visible
  (they appear in the changelog and bump the version); `chore`, `docs`,
  `refactor`, `test`, `build`, `ci`, `style`, `revert` are not.
- **Scope names the consumer.** `feat`/`fix`/`perf` (and anything breaking)
  must be scoped `ts`, `py`, `java`, `ruby`, `vscode`, or `spec`, optionally
  `/package`: `feat(ts/var-vitest): …`, `fix(py/var-core): …`,
  `refactor(java/junit)!: …`. The scope decides which changelog section
  the entry lands in (npm / PyPI / Maven Central / RubyGems / VS Code / all ports).
  Work that ships nothing to a consumer — website, CI, tooling — is a
  `chore(website): …` or similar, never a `feat`: it would bump the version
  while appearing in no changelog section.
- **The subject is the changelog line, verbatim.** Write it for the consumer
  reading release notes, not the reviewer reading the diff: what changed for
  *them*, not how. "generated modules import runtime helpers from
  @varar/vitest/runtime", not "refactor virtual module codegen".
- **Breaking changes:** append `!` to the type and add a
  `BREAKING CHANGE: <consumer-facing migration note>` footer — the note is
  rendered in the changelog under the entry.
- **Versioning is automatic and 0.x-aware:** while on 0.x, a breaking change
  bumps *minor* and everything else bumps *patch* (matching npm's `^0.x`
  caret). 1.0.0 is never inferred — it happens only when a human passes it
  explicitly (`make prepare VERSION=1.0.0`).
- Never edit CHANGELOG.md by hand. It is written **only at release time**, by
  `make prepare` (which folds the unreleased commits into the new version's
  section — those become the GitHub release notes). CI never touches it;
  preview the next release's entries with `make changelog` (stdout only).
  Releasing is two steps on `main`, no PR — `make prepare` then `make release`
  (see doc/RELEASING.md).

## Conventions

- Test files in the project's own test suite: `*.test.ts` (vitest).
- BDD example files (dogfood + docs): plain `*.md`. There is no special `.var.md`
  extension — a file is a spec iff its path matches the `docs` globs in `varar.config.json`.
  `docs` is `{ include, exclude }` (canonical shape — no array shorthand); both
  are plain globs, no `!` prefix. `include` has no default (empty discovers nothing);
  `exclude` removes matches (e.g. a not-implemented tutorial exercise). That config is
  the single source of truth for "what is a spec", consulted by the runner, the LSP, and
  the vitest plugin alike — the plugin drives vitest's own `include`/`exclude` from it.
- Step definition files: `*.steps.ts`.
- Config: every example project in `examples/` carries its own `varar.config.json`
  (docs `*.md` at the project root, steps per language). The repo-root
  `varar.config.json` mirrors `examples/typescript-vitest` for the LSP when the
  repo root is the workspace folder.

## Return-based comparison

A sensor may `return` a value; the pure core compares it against what the Markdown says and fails with span-anchored errors. A sensor's **slots** are its expression parameters in order, then the trailing table/doc string if any. The return maps onto the slots by count (same rule in every port):

- **zero slots** — nothing to compare; returning anything but `undefined`/`null`/`None` → `ReturnShapeError` (throw to fail, return nothing to pass).
- **one slot** — the return IS that slot's value, bare — never read as a positional array, so a parameter type transforming to an array is deep-compared as-is.
- **two or more slots** — the return must be an array/list with exactly one element per slot, compared positionally.

With one or more slots the return is **required**: `undefined`/`null`/`None` → `ReturnShapeError` ("a sensor with N slot(s) must return one value per slot, got nothing"). It used to skip the comparison silently, so a typo'd property access passed while checking nothing. Throwing remains a valid way to fail at any slot count.

Per slot kind: **inline parameter** — deep-equal against the transformed arg → `CellMismatchError` (`CellDiff[]`, each with a source `span` + `expected` + `actual`); **whole table** — exact string compare per cell → `CellMismatchError`; **doc string** — one cell, compared whole: exact equality including the trailing `\n` → `CellMismatchError` (quoted, so a whitespace-only difference stays visible). **Header-bound table rows** bypass the slot contract: the step returns its computed columns as a row object, compared cell-by-cell — returning nothing there is a `ReturnShapeError` too. **Wrong shape** → `ReturnShapeError`; an `undefined` return passes only for a zero-slot sensor.

Because the diffs are anchored to source spans (`startOffset`/`endOffset`), editors render them directly (the website CodeMirror reddens the failing source span and shows `actual: …` on hover). These diffs are the basis of the emerging shared run-result format consumed by the editor, the LSP, and future HTML overlays.

## What's intentionally absent

- No `Given`/`When`/`Then` named exports — two role functions (`stimulus`/`sensor`, bound to a per-example state: `steps(factory)` in TypeScript/Python/Ruby/Kotlin, `Steps.state(factory)` in Java/.NET) chosen by what a step does, not by a keyword. Keywords are author-side narration, never matched. The arrange/act (given/when) concepts remain useful narration, but they share one mechanism: `stimulus`.
- No lifecycle hooks in the BDD layer — use the adapter's native `beforeEach`/`afterEach`.
- No tags in v1.
- No Gherkin AST, no `cucumber-messages`. The parser emits its own minimal immutable AST.
