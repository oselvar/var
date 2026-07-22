# Rename: `oselvar`/`var` → `varar`

Migration plan for renaming the project from **Vár / `@oselvar/var`** to
**Varar**. Status: planned 2026-07-18. Branch: `rename-to-varar`.

## Why

- More unique, searchable name (`var` is un-Googleable; `varar` is not).
- A domain was available and registered: **varar.dev**.
- Free namespaces in package managers: the **`@varar`** npm org is owned; other
  registries have `varar*` free.

The mascot — the Norse goddess **Vár** (accented, guardian of oaths) — **stays**.
The rename actually *strengthens* the brand: **_varar_ = "oaths" in Old Norse**,
so "Vár guards your _varar_" is a tighter story than before. The mythology copy
on the website should be reframed to lean into this, not deleted.

## The three naming axes

The codebase tangles three separable tokens. All three change except the mascot:

| Axis | Today | Becomes |
|------|-------|---------|
| Org / namespace | `oselvar` (npm `@oselvar`, Maven `com.oselvar`, gem/PyPI `oselvar-` prefix, VS Code publisher `oselvar`) | `varar` (npm `@varar`, Maven `dev.varar`, gem/PyPI/crate `varar` base) |
| Product / base name | `var` (CLI `var`, `var.config.json`, facade `@oselvar/var`, import roots `var_core` / `Oselvar::Var` / `com.oselvar.var` / crate `var`) | `varar` |
| Mascot / brand prose | `Vár` (goddess of oaths) | **unchanged** |

## Decisions (locked via interview)

1. **Full rename**: `var` → `varar` everywhere it stands as its own token.
2. **Drop the redundant prefix inside scoped/reverse-DNS namespaces**
   (Cucumber-style): `@varar/varar` facade + `@varar/core`; `dev.varar:varar` +
   `dev.varar:core`. Unscoped ecosystems keep a prefix: `varar`, `varar-core`.
3. **Docs at the apex**: `https://varar.dev` (replaces `var.oselvar.com`).
4. **Rename GitHub repos** under the (retained) `oselvar` org:
   `oselvar/var` → `oselvar/varar`, `oselvar/var-examples` → `oselvar/varar-examples`.
   (The `varar` GitHub org is squatted; revisit later.)
5. **Kotlin package leaf** `com.oselvar.varkt` → `dev.varar.kotlin`.
6. **Keep** `aslak@oselvar.com` (mailbox, not brand) and **keep** `Oselvar Ltd`
   in LICENSE (legal copyright holder).
7. **Deprecate** old published coordinates pointing at the new `@varar` names;
   treat `varar` as a fresh 0.x line.
8. Executed on a **branch/PR**, not straight to trunk.

## Target naming — full coordinate table

### npm (`@varar` scope, prefix dropped; bins keep the product name)

| Dir | Old name | New name | Notes |
|-----|----------|----------|-------|
| `packages/var` | `@oselvar/var` | `@varar/varar` | facade; subpath `./registry` |
| `packages/var-core` | `@oselvar/var-core` | `@varar/core` | |
| `packages/var-config` | `@oselvar/var-config` | `@varar/config` | |
| `packages/var-language` | `@oselvar/var-language` | `@varar/language` | |
| `packages/var-runner` | `@oselvar/var-runner` | `@varar/runner` | |
| `packages/var-vitest` | `@oselvar/var-vitest` | `@varar/vitest` | subpaths `./runtime`, `./reporter` |
| `packages/var-cli` | `@oselvar/var-cli` | `@varar/cli` | **bin `varar`** |
| `packages/var-lsp` | `@oselvar/var-lsp` | `@varar/lsp` | **bin `varar-lsp`**, subpath `./protocol` |
| `packages/var-vscode` | `oselvar-var` | `varar` | publisher `varar`, id `varar.varar` |
| `packages/cucumber` | `@oselvar/cucumber` | `@varar/cucumber` | private |
| `packages/website` | `@oselvar/website` | `@varar/website` | private |
| (root) | `oselvar-var` | `varar-monorepo` | private root |
| `examples/typescript-vitest` | `@oselvar/example-typescript-vitest` | `@varar/example-typescript-vitest` | private |

Directory renames are **optional** (name field is decoupled from the dir), but
recommended for hygiene: `packages/var-core` → `packages/core`, etc., and
`packages/var` → `packages/varar`. Deferred to a follow-up if it complicates the
diff — the plan below keeps directory names and only changes the `name` fields to
minimize churn, then renames dirs as an optional final phase.

### PyPI

| Dir | Old dist | New dist | Old import pkg | New import pkg |
|-----|----------|----------|----------------|----------------|
| `packages/var` | `oselvar-var` | `varar` | `var` | `varar` |
| `packages/var-core` | `oselvar-var-core` | `varar-core` | `var_core` | `varar_core` |
| `packages/var-config` | `oselvar-var-config` | `varar-config` | `var_config` | `varar_config` |
| `packages/var-runner` | `oselvar-var-runner` | `varar-runner` | `var_runner` | `varar_runner` |
| `packages/var-unittest` | `oselvar-var-unittest` | `varar-unittest` | `var_unittest` | `varar_unittest` |
| `packages/var-pytest` | `pytest-var` | `pytest-varar` | `var_pytest` | `varar_pytest` |

Import-package dirs under `src/` are renamed; `[tool.uv.sources]` and the pinned
inter-package deps (`oselvar-var==x` → `varar==x`) update in lockstep.

### Maven (`dev.varar` group — domain-verified via varar.dev)

| Module | Old artifact | New artifact | Old package | New package |
|--------|--------------|--------------|-------------|-------------|
| parent | `com.oselvar:var-parent` | `dev.varar:parent` | — | — |
| var | `com.oselvar:var` | `dev.varar:varar` | `com.oselvar.var` | `dev.varar` |
| var-core | `com.oselvar:var-core` | `dev.varar:core` | `com.oselvar.var.core` | `dev.varar.core` |
| var-config | `com.oselvar:var-config` | `dev.varar:config` | `com.oselvar.var.config` | `dev.varar.config` |
| var-runner | `com.oselvar:var-runner` | `dev.varar:runner` | `com.oselvar.var.runner` | `dev.varar.runner` |
| var-junit | `com.oselvar:var-junit` | `dev.varar:junit` | `com.oselvar.var.junit` | `dev.varar.junit` |
| var-kotlin | `com.oselvar:var-kotlin` | `dev.varar:kotlin` | `com.oselvar.varkt` | `dev.varar.kotlin` |
| var-kotest | `com.oselvar:var-kotest` | `dev.varar:kotest` | `com.oselvar.varkt.kotest` | `dev.varar.kotest` |

Source trees move `src/main/java/com/oselvar/…` → `…/dev/varar/…` (and
`src/main/kotlin/com/oselvar/varkt/…` → `…/dev/varar/kotlin/…`), plus the mirrored
`src/test/…`. Fixtures sub-packages (`…runner.fixtures`, `…junit.fixtures`,
`…kotest.fixtures`, `…crosspkg`) follow their parent.

### RubyGems

| Dir | Old gem | New gem | Old load path | New load path |
|-----|---------|---------|---------------|---------------|
| `packages/var` | `oselvar-var` | `varar` | `oselvar/var` | `varar` |
| `packages/var-core` | `oselvar-var-core` | `varar-core` | `oselvar/var/core` | `varar/core` |
| `packages/var-config` | `oselvar-var-config` | `varar-config` | `oselvar/var/config` | `varar/config` |
| `packages/var-runner` | `oselvar-var-runner` | `varar-runner` | `oselvar/var/runner` | `varar/runner` |
| `packages/var-rspec` | `oselvar-var-rspec` | `varar-rspec` | `oselvar/var/rspec` | `varar/rspec` |
| `packages/var-minitest` | `oselvar-var-minitest` | `varar-minitest` | `oselvar/var/minitest` | `varar/minitest` |

Module nesting `Oselvar::Var::{Core,Config,Runner,Internal,RSpec,Minitest,RegistryGlue}`
collapses to top-level `Varar::{…}`. Files move `lib/oselvar/var/**` → `lib/varar/**`;
gemspec files renamed `oselvar-var-*.gemspec` → `varar-*.gemspec`; every `require`
updates. Homepage `var.oselvar.com` → `varar.dev`.

### Rust (all `publish = false` today — no live crates.io names yet)

| Dir | Old crate | New crate | Old lib | New lib |
|-----|-----------|-----------|---------|---------|
| `rust/var` | `var` | `varar` | `var` | `varar` |
| `rust/var-core` | `var-core` | `varar-core` | `var_core` | `varar_core` |
| `rust/var-config` | `var-config` | `varar-config` | `var_config` | `varar_config` |
| `rust/var-runner` | `var-runner` | `varar-runner` | `var_runner` | `varar_runner` |
| `rust/var-cargotest` | `var-cargotest` | `varar-cargotest` | `var_cargotest` | `varar_cargotest` |

crates.io publish (`65-crates-io.sh`) currently parked because `var` was taken;
the planned name `oselvar-var` becomes **`varar`** (verify free). Enabling
publish is out of scope for this rename — just correct the intended names.

### CLI / product tokens

- CLI command `var` → `varar` (`varar run|lint|init|help`); all hardcoded help/
  error text (`'var — markdown-native BDD'`, `` `var: unknown command` ``).
- `var.config.json` → `varar.config.json` (runner, LSP, vitest plugin, CLI,
  website, root, every `examples/*`, conformance; VS Code activation event
  `workspaceContains:**/varar.config.json`).
- `var.lock.json` → `varar.lock.json`.
- `var.config.schema.json` → `varar.config.schema.json`; `$id`
  `https://oselvar.com/var.config.schema.json` → `https://varar.dev/varar.config.schema.json`.
- Website localStorage keys / custom elements (`var-lang`, `var-palette`,
  `var-palette-select`, …) → `varar-*` (cosmetic, product-scoped).

### Subpath export specifiers (update at every import site)

- `@oselvar/var/registry` → `@varar/varar/registry`
- `@oselvar/var-vitest/runtime` → `@varar/vitest/runtime`
- `@oselvar/var-vitest/reporter` → `@varar/vitest/reporter`
- `@oselvar/var-lsp/protocol` → `@varar/lsp/protocol`
- vitest plugin `name`, `resolve.dedupe` list, and the **generated virtual-module
  source string** it emits.
- `var-cli init` scaffolds `import { steps } from '@oselvar/var'` → `'@varar/varar'`
  (a user-visible generated string).

### Domain / URL / GitHub

- `var.oselvar.com` → `varar.dev` (astro `site`, wrangler `route` + worker `name`
  `var-website` → `varar-website`, all READMEs, gemspec homepages).
- `github.com/oselvar/var` → `github.com/oselvar/varar`; `oselvar/var-examples` →
  `oselvar/varar-examples` (badges, pom `<scm>`/`<url>`, Starlight `editLink`,
  ADR issue links, `70-var-examples.sh`).
- Schema `$id` host + website URLs → `varar.dev`.

### VS Code / Open VSX

- Publisher `oselvar` → `varar`; extension `oselvar-var` → `varar`;
  displayName **`Vár` → `Varar`** (no accent — the accented `Vár` is reserved
  for the goddess references in the docs only); commands
  `oselvar-var.generateStepDefinition` →
  `varar.generateStepDefinition`; LanguageClient id `oselvar-var` → `varar`.
- Marketplace id `oselvar.oselvar-var` → `varar.varar`; Open VSX `oselvar/oselvar-var`
  → `varar/varar`. Dev install script (`scripts/install-vscode.mjs`) name/UUIDs.

## Manual prerequisites (owner action — must land before publishing)

These are **external** and block *publishing*, not the code rename:

- [ ] npm: `@varar` org exists (✅ owned); ensure automation token has publish rights.
- [ ] PyPI: reserve/first-publish `varar`, `varar-core`, `varar-config`,
      `varar-runner`, `varar-unittest`, `pytest-varar`.
- [ ] RubyGems: confirm `varar`, `varar-core`, `varar-config`, `varar-runner`,
      `varar-rspec`, `varar-minitest` free; push owner.
- [ ] crates.io: confirm `varar`, `varar-core`, … free (publishing stays parked).
- [ ] Maven Central: register namespace **`dev.varar`** on the Central Portal;
      verify via a DNS TXT record on **varar.dev**.
- [ ] VS Code Marketplace: create publisher **`varar`** (VSCE_PAT).
- [ ] Open VSX: create namespace **`varar`** (OVSX_PAT).
- [ ] Cloudflare: add **varar.dev** zone, wire the Worker custom-domain route.
- [ ] GitHub: rename `oselvar/var` → `oselvar/varar` and `oselvar/var-examples`
      → `oselvar/varar-examples` (301 redirects preserve old URLs).
- [ ] 1Password (vault `Varar`): new `@varar` npm token, PyPI token; update the
      `op://` refs in `release/release.env` if item names change.

## Progress — COMPLETE (8 commits on `rename-to-varar`)

All phases done, every port's gate re-run green (807 files changed):

- **Coordinates**: npm `@varar/*` · PyPI `varar*` · Maven `dev.varar:*` ·
  RubyGems `varar*` · Rust `varar*` crates. TS build/check/test, Python
  pytest, `mvn install` + all JVM samples, `rake` + Ruby samples, and `cargo`
  all green.
- **Product tokens**: `varar.config.json`, `varar.lock.json`,
  `varar.config.schema.json` (`$id` → varar.dev); CLI command **`varar`**
  (bin `varar`, LSP bin `varar-lsp`); scaffold folder `varar-examples/`.
- **Tooling/branding**: release scripts, `languages.json`, Makefile, CI,
  badges retargeted; `70-varar-examples.sh` sync; front page + README reframed
  around *varar = oaths* (goddess **Vár** kept).
- Commit-lint (`release/lint-commits.sh`) passes over the branch.

### Intentionally NOT changed
- **GitHub org** `oselvar/varar` (varar org is squatted); **email**
  `aslak@oselvar.com`; **LICENSE** `Oselvar Ltd`; **1Password vault** `Varar`.
- ~~Package directory names~~ — **also renamed** (drop the `var-` prefix:
  `packages/core`, `packages/config`, …, facade `packages/varar`); published
  names/coordinates are unchanged, only the on-disk dirs moved. `make check`
  green after the move.
- **Internal code identifiers** (`VarConfig`, `loadVarConfig`, `parseVarLock`,
  the website `var-lang`/`var-palette` localStorage keys) — not user-facing
  coordinates; left to avoid churn/risk.
- **Test data** `Vár`/`vár` in specs, step files, and conformance goldens
  (golden-compared — not branding).
- The dated **`doc/superpowers` + `doc/adr` archive** and `CHANGELOG.md` —
  historical records.

### Still owner-only (external — blocks *publishing*, see prerequisites above)
Registry namespace reservations, Maven `dev.varar` DNS verification, VS Code /
Open VSX publishers, Cloudflare varar.dev, the two GitHub repo renames, and the
new npm/PyPI tokens in 1Password.

## Execution phases (on `rename-to-varar`)

Ordered so each port stays independently build-green. `make <port>` gates each.

1. **TypeScript** — `packages/*` `name` + deps + bins + subpaths + imports +
   plugin/virtual-module strings + `knip.json`; scaffolding string in
   `var-cli init`; website config (site/route/editLink/worker); root
   `package.json` + Makefile filters. Gate: `pnpm -r build && pnpm check && pnpm test`.
2. **Python** — dist names, import-pkg dir renames, `uv.sources`, pinned deps,
   source refs. Gate: `make python`.
3. **Java** — groupId, artifactIds, `package` decls + source-tree moves (Java &
   Kotlin leaf), poms `<scm>`/`<url>`, fixtures. Gate: `make java`.
4. **Ruby** — gem names, gemspec files, `lib/oselvar/var` → `lib/varar` moves,
   `require`s, `Oselvar::Var` → `Varar` module collapse, homepages. Gate: `make ruby`.
5. **Rust** — crate + lib names, workspace members, doc-comment refs. Gate:
   `cargo build && cargo test` (via `make` / `rust.yml` commands).
6. **Product tokens** — `var.config.json`/`var.lock.json`/`var.config.schema.json`
   renames + every reference (root, conformance, examples, `languages.json`
   `stepsGlob`), CLI command/help strings, VS Code activation + commands.
7. **Conformance corpus** — per-language step-file import/package coordinates;
   schema `$id`; goldens unaffected (byte-for-byte identical output — verify).
8. **Examples** — per-project deps/imports/READMEs; `70-var-examples.sh` target
   repo, DEST, dep-pin regex, commit message; examples READ ME + CI badges.
9. **Release tooling** — `release/lib.sh`, `stamp_python.py`, `targets/20`,`40`,
   `50`,`60`,`65`,`70`; `release.env` op refs.
10. **Docs & brand** — README, website `index.mdx` + `oaths.md` (reframe the
    Vár↔varar/oaths etymology), `cliff.toml` seed, CLAUDE.md, ADRs (issue links),
    ANNOUNCEMENT/CONTRIBUTING/IDEA/TODO.
11. **Deprecations** — script/checklist to `npm deprecate` old `@oselvar/*`,
    deprecate old gems/PyPI dists pointing at `@varar` equivalents.
12. **(Optional) directory renames** — `packages/var-*` → `packages/*` etc., last,
    as a mechanical follow-up once names are green.

Full root gate at the end: `make check` (builds+tests all ports; runs
`release/lint-commits.sh`). Website: `pnpm --filter @varar/website build`.

## Watch-outs

- **Conformance goldens must stay byte-for-byte identical** — the rename must not
  alter any runtime output the goldens capture. If a golden references a package
  name in an error/snippet, that's a real change to review.
- **Ruby load path is load-bearing**: `oselvar/var/**` under `lib/` is required by
  path across every gem; the directory move and every `require` must move together.
- **Maven `dev.varar` needs DNS verification** on varar.dev before Central accepts
  the namespace — do this early; it can take time to propagate.
- **`var` is a keyword-ish token**: mechanical `s/var/varar/` is unsafe (it will
  hit the JS/Java `var` keyword, `variable` words, etc.). Rename by *coordinate*
  (package names, import paths, config filenames), never blanket text.
- **Mascot spelling `Vár`** (accented) must survive — don't fold it into `varar`.
- Commit messages must follow Conventional Commits; scope these as the ports they
  touch (mostly `chore`/`refactor`/`docs` — a rename ships no consumer feature,
  though the *first* publish under `@varar` is itself the release event).
