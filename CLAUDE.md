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

## Conventions

- Test files in the project's own test suite: `*.test.ts` (vitest).
- BDD example files (dogfood + docs): `*.var.md`.
- Step definition files: `*.steps.ts`.
- Config: `var.config.ts` at repo root.

## What's intentionally absent

- No `Given`/`When`/`Then` named exports — one `step()` function. Keywords are author-side narration, never matched.
- No lifecycle hooks in the BDD layer — use the adapter's native `beforeEach`/`afterEach`.
- No tags in v1.
- No Gherkin AST, no `cucumber-messages`. The parser emits its own minimal immutable AST.
