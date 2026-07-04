# Multi-language repository restructure + uv bootstrap

Date: 2026-06-29
Status: design, pending implementation

Prep work for the Python port (see [ADR 0001](../../adr/0001-second-language-python.md)
and [issue #2](https://github.com/oselvar/var/issues/2)). This spec covers **only** the
repository restructure and the Python toolchain bootstrap — *not* the Python runtime
port (issue #2), *not* tree-sitter (Sub-project 2), *not* the conformance suite
(separate `conformance-infra` branch).

## Why

`var` is becoming a polyglot project: **parallel native runtime implementations** per
language, kept consistent by one shared conformance suite, plus a **shared
authoring/LSP/website platform** that stays TypeScript and serves every language. The
current layout (a single pnpm workspace at the repo root) silently assumes TypeScript is
*the* project. Before the second language lands, we restructure so the tree reflects the
actual seams, and we bootstrap the Python toolchain (uv) so the symmetry is real and
CI-proven before any code is ported.

Doing this on a quiet trunk is far cheaper than retrofitting symmetry after the Python
port already has paths baked in.

## The asymmetry this encodes

`typescript/` and `python/` are siblings, but they are **not** peers:

- **Parallel native (gets a Python twin):** the *runtime* core — `var`
  (parse → match → plan → execute), `var-runtime` (registry/context), and the runner
  adapter (`var-vitest` ↔ future `var-pytest`).
- **Shared, stays TypeScript forever (serves all languages):** `var-language`,
  `var-lsp`, `var-vscode`, `website`, and the tree-sitter authoring/LSP seam. Confirmed:
  these will always be one TS codebase (ADR 0001, Sub-project 2).
- **Language-neutral (belongs to neither):** the `conformance/` corpus — shared
  `.var.md` bundles + `golden/*.json` — which both harnesses consume.

So `typescript/` is honestly *"shared authoring platform + reference runtime"*; that is
why the LSP, VS Code extension, and website live under it — not because they are
TS-language-specific. The layout makes that explicit rather than burying it.

## Target layout

```
/
  README.md  .gitignore
  doc/                     # ARCHITECTURE.md (shared, target-state multi-language)
  docs/                    # adr/, superpowers/{specs,plans} — shared
  conformance/             # language-NEUTRAL corpus (root-level, shared)
    bundles/<n>/
      example.var.md       # shared bytes for every implementation
      golden/*.json        # reference goldens (TS-generated)
      steps.ts  steps.py   # per-language fixtures, co-located
  typescript/              # the existing pnpm workspace, moved wholesale
    package.json  pnpm-workspace.yaml  biome.json  knip.json  .jscpd.json
    tsconfig.base.json  tsconfig.tests.json
    var.config.ts  vitest.config.ts  vitest.plugins.ts
    packages/  var  var-runtime  var-core  var-language  var-lsp  var-vscode
               var-cli  var-vitest  var-examples  website  cucumber
  python/                  # uv workspace (new, skeleton only)
    pyproject.toml         # [tool.uv.workspace], ruff, pytest
    uv.lock
    packages/  var  var-pytest  var-unittest   # empty skeletons
```

Decisions:

- **Conformance corpus is root-level**, owned by neither language. Both harnesses read
  `../conformance/`. The corpus + harness are **already on main** — corpus at
  `packages/var/bundles/` (bundles use `example.md` + `*.steps.ts`, per the
  `.var.md`-extension removal), projections in `packages/var-core/src/conformance.ts`,
  harness in `packages/var/tests/conformance.test.ts`. The restructure **promotes**
  `packages/var/bundles/` to root `conformance/bundles/` (so it is neutral, not nested in
  the TS `var` package) and repoints the harness.
- **Docs stay at root** (`doc/`, `docs/`). They describe the whole project, not one impl.
- **Each language tree is self-contained**: its package manager, lint/format, type-check,
  and test config live inside its own directory. Nothing language-specific remains at the
  repo root except the shared corpus and docs.

## Scope

**In:**
1. Move the entire pnpm workspace into `typescript/` with history preserved (`git mv`).
2. Fix every relative path the move breaks (workspace globs, tsconfig paths, biome/knip/
   jscpd config, `var.config.ts` globs, vitest configs).
3. Repoint the conformance harness (once landed) at `../conformance/`.
4. Update the single CI workflow (`.github/workflows/website.yml`) for the new TS path,
   and add a Python CI lane that runs `uv run pytest` (green on zero tests).
5. Bootstrap `python/` as a real uv workspace with empty `var` / `var-pytest` /
   `var-unittest` package skeletons (importable, lint-clean, zero tests passing).

**Out:**
- The Python runtime port itself (issue #2) — separate spec/plan.
- Tree-sitter adoption (Sub-project 2) — its own follow-up ADR; a parallel track inside
  the shared TS `var-language`/`var-lsp`, **not** a dependency of the runtime port.
- The conformance suite implementation (`conformance-infra` branch) — lands first, then
  this restructure relocates the TS workspace around it.

## Sequencing

The restructure is a mostly-mechanical, repo-wide `git mv` + path edit. Running it
against a quiet trunk avoids brutal rebase conflicts with open branches.

1. **Quiesce in-flight branches first.** The conformance core is already on main; verify
   the open `conformance-infra` origin branch and the `ARCHITECTURE.md` rewrite worktree
   are merged or abandoned before moving files, so no open branch carries large
   path-conflicting diffs.
2. **Promote the corpus + restructure** (this spec): `git mv packages/var/bundles` to root
   `conformance/bundles`, `git mv` the rest of the workspace into `typescript/`, fix every
   broken relative path, repoint the conformance harness at the new root corpus, update CI.
3. **uv bootstrap** (this spec): create `python/` uv workspace + empty skeletons + CI
   lane proving `uv run pytest` is green.
4. **Python runtime port** — issue #2, a separate spec/plan, later.

## Toolchain: uv for Python

Use **uv** as the Python package/venv/lock tool, and a uv **workspace** (`[tool.uv.workspace]`
in the root `python/pyproject.toml`) as the direct analogue of `pnpm-workspace.yaml`:
each Python package gets its own `pyproject.toml`; the workspace ties them together with a
single `uv.lock`. Test runner is `pytest` (the runtime port targets a pytest plugin);
lint/format is `ruff`. This mirrors the TS side's biome + vitest split. Rationale: uv is
fast, unifies venv + packaging + locking, and signals a current toolchain — consistent
with the ADR's bet on the agentic/modern Python community.

## Verification

The restructure is behaviour-preserving; it is correct when, from the new locations:

- `cd typescript && pnpm -r build` exits 0 (src type-checks).
- `cd typescript && pnpm check` passes (incl. `pnpm typecheck` over `tests/`).
- `cd typescript && pnpm --filter @oselvar/website build` succeeds (Astro).
- The dogfood `.var.md` suites run green under the relocated `var.config.ts`.
- The conformance harness (if already landed) is green reading `../conformance/`.
- `cd python && uv run pytest` exits 0 (zero tests collected is acceptable) and
  `uv run ruff check` is clean.
- CI runs both lanes (TS + Python) on the new paths.
- `git log --follow` resolves history through the moves (confirms `git mv` was used).

## Risks / notes

- **Path-edit blast radius.** The breakage is config relative-paths, not logic. Enumerate
  every config file that references a path and grep for root-relative assumptions
  (`packages/*`, `./tsconfig`, `rootDir`, jscpd/knip globs, `var.config.ts` example globs).
- **Editor/IDE roots.** `.vscode/` and any workspace-root assumptions in `var-vscode`
  dev tooling may need the TS root updated; verify the extension still builds/runs.
- **`.var/` working dir.** The root `.var/` (docs/packages caches) — confirm whether it is
  generated under the TS workspace and should move with it or be regenerated.
- **Two `doc/` vs `docs/`.** Both exist at root today and both stay; no consolidation in
  scope here.

## References

- [ADR 0001 — Python as the second supported language](../../adr/0001-second-language-python.md)
- [Issue #2 — Python port: native pure core + ergonomic pytest plugin](https://github.com/oselvar/var/issues/2)
- [Conformance infrastructure design](2026-06-28-conformance-infrastructure-design.md)
  (lands on the `conformance-infra` branch before this restructure)
