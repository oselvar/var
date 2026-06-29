# Remove the `.var.md` extension convention

**Date:** 2026-06-29
**Status:** approved

## Problem

Var spec files must currently be named `*.var.md`. The extension does double duty:

1. It is the conventional name authors must use.
2. It is a cheap **runtime marker**: ~23 hardcoded `endsWith('.var.md')` checks (the
   vitest `load` hook, the LSP handlers, VSCode, website grouping) use it to answer
   "is this file a var spec?" without consulting any config.

We want specs to be plain `*.md`. The risk: a default glob of `**/*.md` would try to
parse every README and doc in a repo. So discovery must be **filterable** — which it
already is, via the `vars` glob array in `var.config.ts`.

## Decisions

- **`vars` globs become the sole definition of "what is a spec."** A file is a var spec
  iff its path matches a `vars` glob. We promote `vars` from a discovery hint to the
  definition. This is the filter.
- **Require explicit `vars` (no greedy default).** `DEFAULT_CONFIG.vars` becomes `[]`.
  No config / no `vars` ⇒ nothing is discovered or parsed. (`steps` keeps its
  `['**/*.steps.ts']` default — `.steps.ts` stays a distinct, unambiguous extension.)
- **Hard cutover.** Rename every `.var.md` file to `.md`; remove every `.var.md`
  reference. No legacy path; `.var.md` stops being special anywhere.

## Design

### Core (`@oselvar/var`, stays pure)

- `packages/var-core/src/config.ts`: `DEFAULT_CONFIG.vars = []`; `loadVarConfig` returns
  `cfg.vars ?? []`. Other defaults unchanged.
- Matching a path against globs is a pure string→bool operation and may live in the
  core or a shared util. The core never touches the filesystem; discovery (globbing the
  disk) stays in the shells.

### Adapters (shells) — replace the `endsWith('.var.md')` checks

- **var-vitest** (`plugin.ts`): in `configResolved`, glob `cfg.vars` into a
  `Set<absPath>`. `load(id)` transforms a module into a virtual test only when the
  (query-stripped) id is in the Set, instead of `endsWith('.var.md')`. The dogfood/
  cucumber `vitest.config.ts` `include` moves from `**/*.var.md` to the same spec globs
  so vitest does not try to run every `.md`.
- **var-lsp** (`store.ts`, `handlers.ts`): the store already discovers via
  `fs.list(config.vars)` — reuse that index for rename/completions decisions. For
  unsaved/open documents not yet on disk, match the document path against `config.vars`
  with a small glob matcher (in the shell, not the core).
- **website** (`run-grouping.ts`, `editor-mount.ts`, `var-worker.ts`): in-browser the
  only non-spec view is `.steps.ts`, so `endsWith('.var.md')` → `endsWith('.md')` is
  unambiguous. The worker config uses `vars: ['**/*.md']`.
- **var-vscode** (`package.json`, `extension.ts`): drop the `.var.md` language
  association / rename provider; spec files are plain markdown.

### Renames & config

- 16 `.var.md` files → `.md` (6 tutorial + 10 conformance bundles + 1 CLI fixture),
  updating every test and string literal that references them.
- `var.config.ts` (×4), `vitest.config.ts` (×2), `knip.json` globs,
  `var-cli/src/init.ts` generated config template.
- **cucumber**: delete the `library.feature.var.md` symlink; set
  `vars: ['features/**/*.feature']` (globs are free-form, so the Gherkin scanner plugins
  read `.feature` directly — no markdown disguise). `vitest.config.ts` `include` follows.
- Delete the stale `.var/**/*.var.md.json` result trees; they regenerate on next run.
- Docs: `CLAUDE.md`, package READMEs, cucumber migration guide.

## Testing

- New: empty-`vars` default discovers nothing; the vitest plugin transforms only
  Set-matched ids; the LSP treats a configured `.md` as a spec and an unconfigured `.md`
  as not a spec.
- Updated: every fixture/assertion currently keyed on `.var.md`.
- Gates: `pnpm -r build`, `pnpm typecheck`, full vitest, and the dogfood specs
  (`NODE_OPTIONS="--import tsx" npx vitest run`).

## Out of scope

- Deriving vitest `include` from `var.config.ts` to remove the glob duplication (the two
  configs stay manually in sync, as today).
- Any backward-compatibility shim for `.var.md`.
