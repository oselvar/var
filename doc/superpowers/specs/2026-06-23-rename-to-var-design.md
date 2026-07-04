# Rename bdd → Vár (var)

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan

## Goal

Rename the library from "bdd"/"bdds" to **Vár** (https://en.wikipedia.org/wiki/Vár),
spelled **ᚢᛅᚱ** in Younger Futhark. Use `Var`/`var` in package names and code, except
where it would collide with the JavaScript `var` keyword. The accented "Vár" and the
rune ᚢᛅᚱ are branding only and never appear in code, package names, or CLI identifiers.

## Decisions

- **npm packages:** keep the `@oselvar` scope; replace `bdd` with `var`.
- **Spec file extension:** `*.bdd.md` → `*.var.md`.
- **Config:** `bdd.config.ts` → `var.config.ts`; config key `bdds:` → `vars:` (the
  `steps:` key is unchanged).
- **Collision word:** the JS keyword `var` cannot be a bare identifier, so the document
  type becomes `VarDoc` and collision-prone locals/params/fields become `varDoc`
  (`varDocs`, `varPatterns`, `varPaths`).
- **Runic / accent:** ᚢᛅᚱ and "Vár" appear in README/docs/website/announcement
  titles and logo only. All code, package names, and CLI output use ASCII `var`.
- **Public brand "bididi":** the website/docs brand the library "bididi" (wordmark,
  titles, `@oselvar/bididi` install snippet, `*-bididi-*` filenames). This is the same
  library, so "bididi" → "Vár" / "var" as well, including renaming the affected doc
  files. The bogus `@oselvar/bididi` install snippet becomes the real
  `@oselvar/var-vitest`.
- **Methodology "BDD" stays:** "BDD" / "Behaviour-Driven Development" as the *name of the
  methodology* (e.g. "var — markdown-native BDD") is kept. Only the *product* names
  (`bdd`, `bdds`, `bididi`) become Vár. Uppercase `BDD` is therefore handled manually and
  contextually, never blanket-replaced.

## Naming map

### Packages (`packages/<dir>` → name)

| Current dir   | Current name          | New dir       | New name             |
|---------------|-----------------------|---------------|----------------------|
| `bdd`         | `@oselvar/bdd`        | `var`         | `@oselvar/var`       |
| `bdd-vitest`  | `@oselvar/bdd-vitest` | `var-vitest`  | `@oselvar/var-vitest`|
| `bdd-runtime` | `@oselvar/bdd-runtime`| `var-runtime` | `@oselvar/var-runtime`|
| `bdd-cli`     | `@oselvar/bdd-cli`    | `var-cli`     | `@oselvar/var-cli`   |
| `bdd-language`| `@oselvar/bdd-language`| `var-language`| `@oselvar/var-language`|
| `bdd-lsp`     | `@oselvar/bdd-lsp`    | `var-lsp`     | `@oselvar/var-lsp`   |
| `bdd-vscode`  | `oselvar-bdd` (ext)   | `var-vscode`  | `oselvar-var`        |
| `cucumber`    | `@oselvar/cucumber`   | *(unchanged)* | *(unchanged)*        |
| `website`     | `@oselvar/website`    | *(unchanged)* | *(unchanged)*        |

- Root private package `oselvar-bdd` → `oselvar-var`.
- `cucumber` and `website` keep their names; their dependencies, config, and content
  are updated to the new package names / file extension.

### Files & config

- `*.bdd.md` → `*.var.md` (5 files plus every glob pattern that references the extension).
- `bdd.config.ts` → `var.config.ts` (repo root, `packages/cucumber`, and the
  `packages/bdd-cli/tests/fixtures/run-basic` fixture).
- Config key `bdds:` → `vars:`; `steps:` unchanged.
- CLI bin name `bdd` → `var`; `bdd-lsp` → `var-lsp`.

### Code identifiers

- Type `Bdd` → `VarDoc`; compound types swap the `Bdd` prefix for `Var`:
  `BddSource` → `VarSource`, `BddConfig` → `VarConfig`,
  `BddVitestPluginOptions` → `VarVitestPluginOptions`; function `loadBddConfig` →
  `loadVarConfig`.
- Locals/params/fields `bdd` / `bddPatterns` / `bddPaths` → `varDoc` / `varPatterns` /
  `varPaths`.
- Default plugin import currently named `bdd` (`import bdd from '@oselvar/bdd-vitest'`)
  → `varPlugin`; namespace import `import * as bdd from '../src/index.js'` → `varApi`.
- LSP custom method namespace `bdd/*` (e.g. `bdd/didIndex`, `bdd/matchRanges`,
  `bdd/stepAt`, `bdd/planRename`, `bdd/renderExpressionText`) → `var/*`. Client
  (`var-vscode`) and server (`var-lsp`) must stay in sync.
- VS Code `new LanguageClient('oselvar-bdd', 'oselvar BDD', …)` → id `oselvar-var`,
  display name `Vár`.
- Scaffolded example dir `bdd-examples/` (CLI `init`) → `var-examples/`.
- Test temp-dir prefixes `bdd-*` → `var-*` (cosmetic).
- CLI help text, error strings, and `describe()` labels: product `bdd` → `var` (but
  methodology "BDD" is left as-is per the decisions above).
- `var-vscode/src/extension.ts` resolves the LSP binary via the literal path segment
  `'bdd-lsp'` → must become `'var-lsp'` (runtime-critical).

### Public "bididi" branding

- Replace `bididi`/`Bididi` → `Vár`/`var` across `packages/website/**` and `docs/**`
  (excluding historical `doc/superpowers/`).
- `@oselvar/bididi` install snippet → `@oselvar/var-vitest`.
- Rename doc files containing `bididi`: e.g.
  `why-bididi-with-ai-agents.md` → `why-var-with-ai-agents.md`,
  `wire-bididi-into-agent-instructions.md` → `wire-var-into-agent-instructions.md`,
  `drive-features-with-bididi-and-an-agent.md` → `drive-features-with-var-and-an-agent.md`,
  and update every internal link/route that references the old slugs.

### Out of scope

- `packages/*/dist/` — regenerated by the build, never hand-edited.
- The historical spec `doc/superpowers/specs/2026-06-09-bdd-design.md` — left as a
  record of the original design.
- Renaming the git repository / the `oselvar/bdd` working directory — the user's call,
  outside the codebase.

## Execution strategy

1. **Move package dirs** with `git mv` (preserves history): `bdd`→`var`, each `bdd-*`→
   `var-*`, `bdd-vscode`→`var-vscode`.
2. **Rename the 5 `.bdd.md` files** and the 3 `bdd.config.ts` files with `git mv`.
3. **Token replacements**, narrowest-first to avoid clobbering, across `*.json`, `*.ts`,
   `*.md` (excluding `node_modules`, `dist`, and the historical spec):
   - `@oselvar/bdd-vitest` → `@oselvar/var-vitest` (and each other `-*` suffix), then the
     bare `@oselvar/bdd` → `@oselvar/var`.
   - `.bdd.md` → `.var.md`; `bdd.config` → `var.config`; `bdds:` → `vars:`.
   - `Bdd` (word-boundary) → `VarDoc`; lowercase `bdd` identifiers → `varDoc`;
     `bddPatterns`/`bddPaths` → `varPatterns`/`varPaths`.
   - CLI strings and the `bin` keys (`bdd` → `var`, `bdd-lsp` → `var-lsp`).
4. **Branding pass** on README/docs/website/`ANNOUNCEMENT.md`: add "Vár" and ᚢᛅᚱ to
   titles/logo.
5. **Regenerate** the lockfile (`pnpm install`) and **rebuild** (`pnpm -r build`).
6. **Verify:** `pnpm check` (lint + test + knip + jscpd) green, plus a
   `grep -ri '\bbdd\b'` sweep confirming no stragglers outside the historical spec.

## Risks & mitigations

- **Build-output `.d.ts` drift** — handled by rebuild, not by editing `dist/`.
- **Over-eager replacement of `bdd` inside unrelated words or the `cucumber` package** —
  mitigated by word-boundary matching and the final grep sweep.
- **Suffix-order clobbering** (e.g. replacing `@oselvar/bdd` before `@oselvar/bdd-vitest`
  turning it into `@oselvar/var-vitest` correctly) — mitigated by replacing the longer,
  suffixed names before the bare name.
