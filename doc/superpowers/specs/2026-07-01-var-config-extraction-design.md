# Extract `@oselvar/var-config` out of `var-core`

Date: 2026-07-01
Status: design, pending implementation (TDD)

Prerequisite for the
[config-driven step-file recognition](2026-07-01-config-driven-step-files-design.md)
sub-project: that plan wants `var-vscode` to call `loadVarConfig` directly
(rather than round-tripping through the not-yet-started LSP, which hits a
`vscode-languageclient` limitation — `documentSelector` can't be changed
after the client is constructed). Pulling in all of `@oselvar/var-core`
just for `loadVarConfig` was flagged as a smell before writing that plan —
this sub-project fixes the underlying cause.

## Why this belongs outside `var-core`

`var-core`'s own `config.ts`/`config-types.ts`/`find-files.ts` do real Node
I/O — `existsSync`, dynamic `import()` of a `.ts`/`.js` config file,
`node:fs`'s `globSync`. This is already implicitly acknowledged in the
codebase: `loadVarConfig`/`findFiles` are exported from a separate
`@oselvar/var-core/node` subpath (`node.ts`), not the package's main entry —
specifically because they're impure and shouldn't be reachable from code
that expects the "pure core" contract.

Checked whether Python or Java's ports need an equivalent extraction (per
ADR 0001's module-for-module porting principle) — they don't, and the
evidence is now stronger than "Java doesn't have config loading yet."
Java's `var-runner`/`var-junit` sub-project (merged to `main` after this
design was first drafted) landed its own
`java/var-runner/src/main/java/com/oselvar/var/runner/VarConfig.java`. Its
own Javadoc documents it as a "port of `var_runner.config.VarConfig`
(Python), same field semantics as every other language port" — but a
hand-rolled, JUnit-Platform-native mechanism (`VarConfig.fromLookup` reads
three `junit-platform.properties`-style keys via a caller-supplied
`Function<String, Optional<String>>`, explicitly chosen so the module never
imports a JUnit-Platform type). It shares only the *field semantics*
(`include`/`exclude` glob shape) with Python's config, never code or a
package — exactly the pattern this design doc already assumed, now
confirmed by a second independent implementation rather than an absence.
It's also a strict subset of TS's `VarConfig`: no `snippet.template`, no
`scannerPlugins` — those are authoring/LSP-only fields Java (and Python) has
no equivalent of, reinforcing that TS's fuller `VarConfig` shape is
TS-ecosystem-specific, not a cross-language contract other ports need to
track. Python's config loading (`python/packages/var-runner/src/var_runner/config.py`)
is likewise a separate, hand-written file, never a literal port of TS's
`config.ts`. So this remains purely a TypeScript-internal cleanup, not a
cross-language contract — the same category of fix as the
[SnippetEmitter relocation](2026-07-01-snippet-emitter-port-design.md), but
this time nothing needs updating on the Python/Java side.

## What moves

Verbatim, `var-core/src/` → new package `var-config/src/`:

- `config.ts` (`loadVarConfig`)
- `config-types.ts` (`VarConfig`, `VarGlobs`)
- `find-files.ts` (`findFiles`) — already tightly coupled to config in
  practice (`var-runner` re-exports it alongside `loadVarConfig` under
  `findSpecs`/`readVarConfig`), and has no other purpose independent of
  config-driven file discovery.
- Their existing tests, same-named, from `var-core/tests/` to
  `var-config/tests/`.

**A genuinely clean side effect:** `var-core/src/node.ts` exports exactly
these two things (`loadVarConfig`, `findFiles`) today and nothing else. Once
both move out, `node.ts` — and the entire `@oselvar/var-core/node` subpath
in `var-core/package.json` — can be deleted outright. `var-core` becomes a
package with **zero Node/filesystem exports**, matching the Java and Python
ports' own "zero I/O in the core" shape exactly, not just approximately.

**Stays in `var-core`:** `scanner.ts`'s `ScannerPlugin` type. `VarConfig`'s
`scannerPlugins` field references it, so the new `var-config` package
depends on `var-core` for this one type — correct direction, the same
pattern already established by `var-language` depending on `var-core`.

## Consumers

Checked every real consumer in the workspace (excluding `dist/` build
output) before scoping this:

- **`var-lsp`** (`src/bin.ts`, `src/file-system.ts`, `src/store.ts`) — the
  only package importing directly from `@oselvar/var-core`/
  `@oselvar/var-core/node` for config. Import paths switch to
  `@oselvar/var-config`; `var-lsp` keeps its existing `@oselvar/var-core`
  dependency too (still needs `createRegistry` and others), this just adds
  a second one.
- **`var-runner/src/config.ts`** — currently a thin re-export layer
  (`export type { VarConfig } from '@oselvar/var-core'`;
  `export { findFiles as findSpecs, loadVarConfig as readVarConfig } from
  '@oselvar/var-core/node'`). Its *sources* switch to `@oselvar/var-config`;
  its own renamed public API (`readVarConfig`, `findSpecs`) is unchanged, so
  nothing downstream of `var-runner` needs to know this happened.
- **`var-cli`** (`run.ts`, `lint.ts`) and **`var-vitest`** (`plugin.ts`) —
  both import `readVarConfig`/`findSpecs` exclusively through
  `@oselvar/var-runner`, never directly from `var-core`. **Zero changes**
  needed in either package.
- **`var-vscode`** — not a consumer today. Gains `@oselvar/var-config` as a
  new dependency in the follow-up plan (out of scope here) to call
  `loadVarConfig` directly at `activate()` time, without pulling in
  `cucumber-expressions`, the matcher, or the parser.

## Package setup

New workspace package `packages/var-config` (`@oselvar/var-config`), picked
up automatically by the existing `packages/*` entry in
`pnpm-workspace.yaml` — no workspace config changes needed. Single export
surface (`.` → `src/index.ts`); no subpath split, since everything in this
package is Node-specific by nature (unlike `var-core`, there's no pure/impure
boundary to draw *within* `var-config` itself).

## Testing

Behavior-preserving move, same pattern as the SnippetEmitter relocation:
`var-core/tests/config.test.ts` (the only existing test file covering any of
the moved code — `find-files.ts` has no dedicated test file today) moves
with the code unchanged in content, serving as the regression guard.
`var-lsp`'s and `var-runner`'s own existing test suites continue to pass
unchanged aside from import-path fixes, proving the consumer side works
end-to-end.

## Out of scope

- Actually wiring `loadVarConfig` into `var-vscode`'s `activate()` — that's
  the follow-up [config-driven step-file recognition](2026-07-01-config-driven-step-files-design.md)
  plan, which depends on this one landing first.
- Renaming `var-runner`'s `readVarConfig`/`findSpecs` aliases to match
  `var-config`'s own naming, or having `var-cli`/`var-vitest` import
  `@oselvar/var-config` directly instead of through `var-runner` — no
  reason to touch a currently-working, currently-invisible-to-them
  indirection layer as part of a location-only move.
