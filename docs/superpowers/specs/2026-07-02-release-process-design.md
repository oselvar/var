# Release process design

Date: 2026-07-02
Status: approved

## Goal

A single local command releases every language port of var to its package
registry, tags the release in git, and creates a GitHub release. The process
is idempotent: if any step fails, re-running the same command resumes where it
left off and never repeats a completed step. New language ports (Rust, Go,
.NET, ...) plug in as new target scripts without changing the orchestrator.

## Decisions

- **Lockstep versioning.** One version for the whole repo. `v0.2.0` releases
  every publishable package in every language as `0.2.0`. One git tag
  (`vX.Y.Z`), one GitHub release.
- **Explicit version argument.** `make release VERSION=0.2.0` (wrapping
  `release/release.sh 0.2.0`). No auto-bumping — deterministic and re-runnable.
- **Plain shell scripts** orchestrated by one entry script; one script per
  publish target, run in glob order. No release framework.
- **Idempotency by registry probe.** No local state files. Each target asks
  the registry "does version X exist?" and publishes only what is missing.
- **Secrets from 1Password** via the `op` CLI, vault `Var`. A committed
  `release/release.env` holds only `op://Var/...` references; `op run`
  injects real values just for the publish phase.
- **Release notes from CHANGELOG.md.** The `## [x.y.z]` section becomes the
  GitHub release body. Preflight fails if the section is missing.

## Publish targets (v1)

| Order | Target | Packages | Tooling |
|---|---|---|---|
| 10 | npm | `@oselvar/var`, `var-core`, `var-runner`, `var-vitest`, `var-cli`, `var-config`, `var-language`, `var-lsp` | `pnpm publish` |
| 20 | PyPI | `oselvar-var`, `oselvar-var-core`, `oselvar-var-runner`, `pytest-var`, `oselvar-var-unittest` | `uv build` + `uv publish` |
| 30 | Maven Central | `com.oselvar:var-parent` + 6 modules (incl. Kotlin facades) | `mvn deploy` via `central-publishing-maven-plugin`, GPG-signed |
| 40 | VS Code Marketplace | `oselvar.oselvar-var` extension | `vsce publish` |
| 50 | Open VSX | `oselvar.oselvar-var` extension | `ovsx publish` |

Prerequisite fix: `typescript/packages/var-vscode/package.json` gets
`"private": true` so the npm target never publishes the extension to npm.

## Layout

```
release/
  release.sh            # single entry point: release.sh <version>
  lib.sh                # shared helpers: logging, probes, require-tool checks
  release.env           # op://Var/... secret references (committed, no secrets)
  targets/
    10-npm.sh
    20-pypi.sh
    30-maven-central.sh
    40-vscode-marketplace.sh
    50-open-vsx.sh
docs/RELEASING.md       # one-time account/credential setup guide
Makefile                # gains: make release VERSION=x.y.z
```

## Orchestrator phases

`release.sh <version>` runs, in order:

1. **Preflight** (fail fast, zero side effects):
   - argument is valid semver;
   - on `main`, working tree clean, in sync with `origin/main`;
   - required tools on PATH: `pnpm`, `node`, `uv`, `mvn`, `gh`, `vsce`,
     `ovsx`, `op`, `gpg`, `curl`, `jq`;
   - `op` signed in and every reference in `release.env` resolves
     (`op run --env-file=release/release.env -- true`-style check);
   - `CHANGELOG.md` contains a `## [x.y.z]` section with non-empty body;
   - if tag `vX.Y.Z` already exists it must point at a commit whose manifests
     already carry `x.y.z` (a resume), otherwise hard error.
2. **Gate**: `make check` — the same three-port build+test gate as CI.
3. **Stamp**: write `x.y.z` into every manifest (see below). If nothing
   changed, skip; otherwise commit `Release vX.Y.Z`.
4. **Tag**: create annotated tag `vX.Y.Z` at HEAD if it does not exist. If it
   exists and points elsewhere than the release commit: hard error with
   instructions (never silently retag).
5. **Publish**: run every executable `release/targets/*.sh` in glob order
   under `op run --env-file=release/release.env`. Each target is
   independently idempotent. A failing target does not stop the others; the
   orchestrator collects per-target results.
6. **Push** (only if every target succeeded): push the release commit and
   the tag to `origin`.
7. **GitHub release** (only if every target succeeded): if
   `gh release view vX.Y.Z` says it does not exist,
   `gh release create vX.Y.Z --title "vX.Y.Z"` with the extracted CHANGELOG
   section as the body.
8. **Summary**: print each target as `published`, `already published`, or
   `FAILED (reason)`. Exit non-zero if any target failed, with the
   instruction "fix and re-run the same command".

Phase order rationale: stamp+tag before publish so every published artifact
is built from a tagged commit; push+GitHub release after publish so a publish
failure leaves nothing announced (tag push happens on the successful run).

## Target contract

Each `targets/NN-<name>.sh`:

- is invoked as `<script> <version>` from the repo root with secrets already
  in the environment;
- sources `release/lib.sh` for helpers;
- probes the registry first and publishes only missing artifacts —
  per-package granularity where the target has several packages;
- honors `DRY_RUN=1`: build + probe + print what would be published, publish
  nothing;
- exits 0 if everything is (now or already) published, non-zero on real
  failure.

Idempotency probes:

| Target | Probe |
|---|---|
| npm | `npm view <pkg>@<v> version` per package |
| PyPI | `GET https://pypi.org/pypi/<name>/<v>/json` per package |
| Maven Central | Central Portal publisher API: published-check for `com.oselvar:<artifact>:<v>` (not repo1, which lags validated deployments by minutes) |
| VS Code Marketplace | `vsce show oselvar.oselvar-var --json` version compare |
| Open VSX | `GET https://open-vsx.org/api/oselvar/oselvar-var/<v>` |

Adding a language port later = adding one new target script (plus its version
stamping in the stamp step and a section in `docs/RELEASING.md`). E.g. Rust:
`targets/60-crates-io.sh` probing `crates.io/api/v1/crates/<name>/<v>` and
publishing with `cargo publish`.

## Version stamping

- **TypeScript** (also covers both VS Code targets): a node one-liner loops
  over `typescript/packages/*/package.json` and sets `version` on every
  package, private ones included (harmless; keeps the workspace consistent).
  `workspace:*` dependency ranges are left alone — pnpm rewrites them to the
  concrete version at publish time.
- **Python**: `uv version <v>` per package under `python/packages/*`.
  Workspace-internal dependencies remain `tool.uv.sources` workspace refs
  locally; verify during testing that built wheels carry correct `==x.y.z`
  (or compatible) constraints in their metadata.
- **Java**: `mvn versions:set -DnewVersion=<v>` on the parent (updates all
  modules) followed by `versions:commit` to drop backup files.

Stamping is idempotent: manifests already at `x.y.z` produce no diff and no
commit.

## Secrets (1Password vault `Var`)

`release/release.env` (committed):

```
NPM_TOKEN=op://Var/npm-oselvar/token
UV_PUBLISH_TOKEN=op://Var/pypi-oselvar/token
CENTRAL_USERNAME=op://Var/sonatype-central/username
CENTRAL_PASSWORD=op://Var/sonatype-central/token
GPG_PASSPHRASE=op://Var/maven-gpg/passphrase
VSCE_PAT=op://Var/vscode-marketplace/pat
OVSX_PAT=op://Var/open-vsx/pat
```

Only the publish phase runs under `op run`; secrets never touch disk or the
outer shell. `gh` uses its own existing auth. The GPG private key lives in
the local keyring; its backup (exported key + passphrase) is stored as a
1Password document in the `Var` vault.

## Failure handling / re-run semantics

Invariant: `release.sh 0.2.0` may be run any number of times; each run
converges toward "fully released" and never repeats a completed step.

- Registries that reject re-uploads (npm, PyPI, Central, both extension
  marketplaces) are never re-uploaded to, because probes run first.
- Partial npm/PyPI publishes resume at the missing packages.
- Maven Central eventual consistency is handled by probing the Portal
  deployment status rather than repo1.
- Tag/release/commit steps are all guarded by existence checks.
- A hard mismatch (existing tag pointing at a different commit) aborts with
  instructions rather than guessing.

## One-time setup (docs/RELEASING.md)

Documented, since today only the npm org exists:

1. npm: create automation token for `@oselvar` scope → 1Password `Var/npm-oselvar`.
2. PyPI: account + API token (project-scoped after first upload) →
   `Var/pypi-oselvar`.
3. Sonatype Central Portal: account, verify `com.oselvar` namespace (DNS TXT
   on oselvar.com), generate publishing token → `Var/sonatype-central`.
   Maven build gains a `release` profile with `central-publishing-maven-plugin`,
   `maven-gpg-plugin`, `maven-source-plugin`, `maven-javadoc-plugin` (Central
   requires sources, javadoc, signatures, and POM metadata: name, description,
   URL, license, developers, SCM).
4. GPG: generate signing key, upload to keyserver.ubuntu.com, back up to
   `Var/maven-gpg`.
5. VS Code Marketplace: publisher `oselvar` on marketplace.visualstudio.com,
   Azure DevOps PAT → `Var/vscode-marketplace`.
6. Open VSX: Eclipse Foundation account, sign publisher agreement, create
   `oselvar` namespace (`ovsx create-namespace oselvar`), access token →
   `Var/open-vsx`.
7. `CHANGELOG.md` created at repo root (Keep a Changelog format).

## Testing strategy

- `DRY_RUN=1 release/release.sh <version>` exercises preflight, gate, stamp
  (on a scratch branch or with stamp skipped), probes, and prints the publish
  plan for every target without publishing.
- Preflight/stamp/tag logic tested with a throwaway version on a branch; tag
  deleted afterwards.
- First real release is `0.1.0`; expect to exercise the resume path for real
  (Central validation failures are common on first setup) — that is the
  design working as intended.
- After the first release, verify installability end to end:
  `npm install @oselvar/var`, `uv add oselvar-var`, a Maven resolve of
  `com.oselvar:var`, and both extension listings.

## Out of scope (v1)

- Conventional-commit automation, auto-bumping, per-language versions.
- CI-driven releases (the design deliberately runs locally; nothing prevents
  running the same script in CI later).
- Rust/Go/.NET targets — accommodated by the target contract, added when the
  ports exist.
