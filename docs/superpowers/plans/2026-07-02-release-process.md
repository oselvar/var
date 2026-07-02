# Release Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single local command (`make release VERSION=x.y.z`) that releases every language port to npm, PyPI, Maven Central, VS Code Marketplace, and Open VSX, tags the release, and creates a GitHub release — idempotently.

**Architecture:** Plain bash orchestrator (`release/release.sh`) running phases: preflight → gate → stamp → tag → publish targets (glob-ordered scripts in `release/targets/`, each probing its registry and publishing only what's missing) → push → GitHub release. Secrets injected only for the publish phase via 1Password `op run` (vault `Var`). No local state files — registries are the source of truth for idempotency.

**Tech Stack:** bash, `op` (1Password CLI), `pnpm publish`, `uv build`/`uv publish`, `mvn deploy` + `central-publishing-maven-plugin` + `maven-gpg-plugin`, `vsce`, `ovsx`, `gh`, `jq`, `curl`.

**Spec:** `docs/superpowers/specs/2026-07-02-release-process-design.md`

## Global Constraints

- Run all pnpm/vitest/tsc commands from `typescript/`; package paths in tasks are explicit.
- Trunk-based: each task commits directly to `main`, self-contained and green.
- After touching any `package.json`/`pyproject.toml`/`pom.xml`, the relevant port must still build: `make typescript` / `make python` / `make java` (or the targeted commands shown in the task).
- Never commit a secret. `release/release.env` contains only `op://Var/...` references.
- License is MIT, copyright **Oselvar Ltd**. GitHub repo: `https://github.com/oselvar/var`.
- Lockstep version: every publishable artifact in every language shares one version.
- All shell scripts: `#!/usr/bin/env bash` + `set -euo pipefail`, executable (`chmod +x`).
- Versions of Maven plugins given below were correct as of 2026-07: verify each against `https://repo1.maven.org/maven2/<group-path>/<artifact>/maven-metadata.xml` before using, and bump to the latest release if newer.

---

### Task 1: Publishing metadata (LICENSE, npm fields, Python fields, var-vscode private)

**Files:**
- Create: `LICENSE` (already created in working tree — MIT, Oselvar Ltd; commit it here)
- Modify: `typescript/packages/*/package.json` (license + repository fields; `private: true` on var-vscode)
- Modify: `python/packages/{var,var-core,var-runner,var-pytest,var-unittest}/pyproject.toml` (license field)

**Interfaces:**
- Produces: every publishable manifest carries MIT license metadata; `oselvar-var` (the VS Code extension package) is invisible to the npm target because `private: true`.

- [ ] **Step 1: Verify LICENSE exists in the working tree**

Run: `head -3 LICENSE`
Expected: `MIT License` / blank / `Copyright (c) 2026 Oselvar Ltd`

- [ ] **Step 2: Add license + repository to all TS packages, private to var-vscode**

Run from `typescript/`:

```bash
node -e '
const fs = require("node:fs"), path = require("node:path");
for (const dir of fs.readdirSync("packages")) {
  const file = path.join("packages", dir, "package.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.license = "MIT";
  pkg.repository = {
    type: "git",
    url: "git+https://github.com/oselvar/var.git",
    directory: `typescript/packages/${dir}`,
  };
  if (dir === "var-vscode") pkg.private = true;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
'
```

- [ ] **Step 3: Verify the sweep**

Run from `typescript/`:

```bash
for p in packages/*/package.json; do node -e "const j=require('./$p'); console.log(j.name, j.license, j.private?'PRIVATE':'public')"; done
```

Expected: every line ends `MIT`; `oselvar-var` now shows `PRIVATE`.

- [ ] **Step 4: Add `license = "MIT"` to each Python package**

In each of `python/packages/var/pyproject.toml`, `var-core`, `var-runner`, `var-pytest`, `var-unittest`: add a line `license = "MIT"` inside the `[project]` table, directly after the `requires-python` line (or after `version` if no `requires-python`).

- [ ] **Step 5: Verify Python metadata builds**

Run from `python/`:

```bash
uv build --package oselvar-var-core -o /tmp/var-license-check
tar -xzOf /tmp/var-license-check/oselvar_var_core-0.0.0.tar.gz --include='*/PKG-INFO' | grep -i license
```

Expected: a `License-Expression: MIT` (or `License: MIT`) line. If `uv build` rejects the bare SPDX string (old hatchling), use `license = { text = "MIT" }` instead and re-verify.

- [ ] **Step 6: Confirm ports still pass**

Run: `cd typescript && pnpm check` and `cd python && uv sync && uv run pytest -q`
Expected: both green. (`biome` may reformat package.json files — if `pnpm check` complains, run `pnpm exec biome format --write packages/*/package.json` and re-run.)

- [ ] **Step 7: Commit**

```bash
git add LICENSE typescript/packages python/packages python/uv.lock
git commit -m "chore: MIT license (Oselvar Ltd) + publishing metadata; var-vscode npm-private"
```

---

### Task 2: CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

**Interfaces:**
- Produces: a `## [x.y.z]` section per release; `changelog_body` in Task 3 extracts the lines between `## [x.y.z]` and the next `## [` heading.

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
lockstep across every port: one `vX.Y.Z` git tag releases npm, PyPI,
Maven Central, the VS Code Marketplace, and Open VSX together.

`release/release.sh` refuses to release a version that has no `## [x.y.z]`
section below. Before releasing, rename `## [Unreleased]` to `## [x.y.z]`
(and start a fresh `## [Unreleased]` on top).

## [Unreleased]

### Added

- First public release of var: Markdown-native BDD for TypeScript (npm),
  Python (PyPI), and Java/Kotlin (Maven Central), plus the Vár VS Code
  extension (Marketplace and Open VSX).
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG (Keep a Changelog, lockstep versions)"
```

---

### Task 3: Release scaffolding — `lib.sh`, `release.env`, `maven-settings.xml`, Makefile target, .gitignore

**Files:**
- Create: `release/lib.sh`, `release/release.env`, `release/maven-settings.xml`
- Modify: `Makefile`, `.gitignore`

**Interfaces:**
- Produces (used by every later task): `REPO_ROOT` (absolute repo root), `log`, `warn`, `die` (exits 1), `require_tool <name>`, `is_semver <v>`, `http_ok <url>` (0 iff 2xx), `changelog_body <version>` (prints section body), `build_vsix <version>` (prints path to `.vsix`, building it once).
- Produces: env var names `NPM_TOKEN`, `UV_PUBLISH_TOKEN`, `CENTRAL_USERNAME`, `CENTRAL_PASSWORD`, `MAVEN_GPG_PASSPHRASE`, `VSCE_PAT`, `OVSX_PAT`.

- [ ] **Step 1: Create `release/lib.sh`**

```bash
#!/usr/bin/env bash
# Shared helpers for release scripts. Source this; do not execute it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[release]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[release]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

require_tool() { command -v "$1" >/dev/null 2>&1 || die "required tool not on PATH: $1"; }

is_semver() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

# 0 iff the URL answers 2xx.
http_ok() { curl -fsSL -o /dev/null "$1" 2>/dev/null; }

# Print the body of the `## [x.y.z]` CHANGELOG section (up to the next `## [`).
changelog_body() {
  awk -v ver="$1" '
    /^## \[/ { if (found) exit; if (index($0, "## [" ver "]") == 1) { found = 1; next } }
    found { print }
  ' "$REPO_ROOT/CHANGELOG.md"
}

# Build the extension .vsix once per version; marketplace + Open VSX share it.
# Prints the .vsix path on stdout (all build noise goes to stderr).
build_vsix() {
  local version="$1"
  local vsix="$REPO_ROOT/release/dist/oselvar-var-$version.vsix"
  [[ -f "$vsix" ]] && { echo "$vsix"; return 0; }
  local manifest_version
  manifest_version="$(jq -r .version "$REPO_ROOT/typescript/packages/var-vscode/package.json")"
  [[ "$manifest_version" == "$version" ]] ||
    die "var-vscode/package.json is at $manifest_version, not $version — stamp has not run"
  mkdir -p "$REPO_ROOT/release/dist"
  (cd "$REPO_ROOT/typescript" && pnpm install --frozen-lockfile >&2 && pnpm --filter oselvar-var build >&2)
  (cd "$REPO_ROOT/typescript/packages/var-vscode" && vsce package --no-dependencies -o "$vsix" >&2)
  echo "$vsix"
}
```

- [ ] **Step 2: Create `release/release.env`** (op:// references only — safe to commit)

```
NPM_TOKEN=op://Var/npm-oselvar/token
UV_PUBLISH_TOKEN=op://Var/pypi-oselvar/token
CENTRAL_USERNAME=op://Var/sonatype-central/username
CENTRAL_PASSWORD=op://Var/sonatype-central/token
MAVEN_GPG_PASSPHRASE=op://Var/maven-gpg/passphrase
VSCE_PAT=op://Var/vscode-marketplace/pat
OVSX_PAT=op://Var/open-vsx/pat
```

- [ ] **Step 3: Create `release/maven-settings.xml`** (credentials come from env at run time)

```xml
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
  <servers>
    <server>
      <id>central</id>
      <username>${env.CENTRAL_USERNAME}</username>
      <password>${env.CENTRAL_PASSWORD}</password>
    </server>
  </servers>
</settings>
```

- [ ] **Step 4: Add the Makefile target and ignore `release/dist/`**

Append to `Makefile` (and add `release` to `.PHONY`):

```make
# Release every port at VERSION (idempotent; re-run the same command on failure).
#   make release VERSION=0.1.0
release:
	@test -n "$(VERSION)" || { echo "usage: make release VERSION=x.y.z"; exit 1; }
	release/release.sh $(VERSION)
```

Append to `.gitignore` (create if missing):

```
release/dist/
```

- [ ] **Step 5: Test the helpers**

```bash
bash -c 'source release/lib.sh; is_semver 1.2.3 && echo semver-ok; is_semver 1.2 || echo bad-rejected; http_ok https://pypi.org/pypi/pytest/json && echo http-ok; http_ok https://pypi.org/pypi/definitely-not-a-package-xyz9/9.9.9/json || echo http-404-rejected; changelog_body Unreleased | head -2'
```

Expected output includes: `semver-ok`, `bad-rejected`, `http-ok`, `http-404-rejected`, and the first lines of the Unreleased section (`### Added` after a blank line).

- [ ] **Step 6: Commit**

```bash
chmod +x release/lib.sh
git add release/lib.sh release/release.env release/maven-settings.xml Makefile .gitignore
git commit -m "feat(release): shared helpers, op secret refs, maven settings, make target"
```

---

### Task 4: Version stamping — `release/stamp.sh` + `release/stamp_python.py`

**Files:**
- Create: `release/stamp.sh`, `release/stamp_python.py`

**Interfaces:**
- Consumes: `lib.sh` helpers.
- Produces: `release/stamp.sh <version>` — sets the version in every TS `package.json`, every Python `pyproject.toml` (pinning workspace-internal deps to `==<version>`), every Maven module, and refreshes `python/uv.lock`. Idempotent: second run produces no diff.

- [ ] **Step 1: Create `release/stamp_python.py`**

```python
"""Stamp the lockstep release version into every Python package.

Sets [project] version and pins workspace-internal dependencies to
==<version> so published wheels depend on the exact same release.
Idempotent: re-running with the same version changes nothing.
"""

import pathlib
import re
import sys

VERSION = sys.argv[1]
INTERNAL = {
    "oselvar-var",
    "oselvar-var-core",
    "oselvar-var-runner",
    "pytest-var",
    "oselvar-var-unittest",
}


def pin(match: re.Match) -> str:
    name = match.group(1)
    if name in INTERNAL:
        return f'"{name}=={VERSION}"'
    return match.group(0)


for pyproject in sorted(pathlib.Path("python/packages").glob("*/pyproject.toml")):
    text = pyproject.read_text()
    text = re.sub(r'(?m)^version = ".*"$', f'version = "{VERSION}"', text, count=1)
    text = re.sub(r'"([A-Za-z0-9._-]+?)(?:==[0-9][^"]*)?"', pin, text)
    pyproject.write_text(text)

print(f"stamped {VERSION} into python/packages/*/pyproject.toml")
```

(The dependency regex only rewrites quoted strings that are exactly an internal package name with an optional `==` pin — `"cucumber-expressions==20.0.0"` and `"pytest>=8"` don't match an internal name and pass through untouched.)

- [ ] **Step 2: Create `release/stamp.sh`**

```bash
#!/usr/bin/env bash
# Stamp <version> into every manifest of every port. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

VERSION="${1:-}"
[[ -n "$VERSION" ]] || die "usage: release/stamp.sh <version>"
is_semver "$VERSION" || die "not a semver version: $VERSION"

log "stamping TypeScript packages"
node -e '
const fs = require("node:fs"), path = require("node:path");
const version = process.argv[1];
for (const dir of fs.readdirSync("typescript/packages")) {
  const file = path.join("typescript/packages", dir, "package.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (pkg.version === version) continue;
  pkg.version = version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
' "$VERSION"

log "stamping Python packages (+ pinning internal deps)"
python3 release/stamp_python.py "$VERSION"
(cd python && uv lock --quiet)

log "stamping Java modules"
(cd java && mvn --batch-mode --quiet versions:set -DnewVersion="$VERSION" -DgenerateBackupPoms=false)

log "stamped $VERSION"
```

- [ ] **Step 3: Test — stamp a scratch version, inspect, stamp again (idempotency), revert**

```bash
release/stamp.sh 9.9.9
git diff --stat | tail -3
node -e "console.log(require('./typescript/packages/var/package.json').version)"
grep -h 'oselvar-var-core' python/packages/var/pyproject.toml
grep '<version>' java/pom.xml | head -1
release/stamp.sh 9.9.9
git status --porcelain | wc -l   # same file count — second run added nothing
git checkout -- typescript python java && git status --porcelain
```

Expected: diff touches all `package.json`, all `pyproject.toml`, `python/uv.lock`, all `pom.xml`; version prints `9.9.9`; the Python dep line reads `"oselvar-var-core==9.9.9"`; parent pom shows `<version>9.9.9</version>`; final `git status --porcelain` is empty.

- [ ] **Step 4: Commit**

```bash
chmod +x release/stamp.sh
git add release/stamp.sh release/stamp_python.py
git commit -m "feat(release): lockstep version stamping for all three ports"
```

---

### Task 5: Orchestrator — `release/release.sh`

**Files:**
- Create: `release/release.sh`

**Interfaces:**
- Consumes: `lib.sh`, `stamp.sh`, `release.env`, `CHANGELOG.md`.
- Produces: the single release command. Env knobs: `DRY_RUN=1` (probe/plan only, no mutations), `SKIP_GATE=1` (skip `make check` on resumes). Runs every executable `release/targets/*.sh` with args `<version>`; a target's non-zero exit marks it FAILED but the remaining targets still run.

- [ ] **Step 1: Create `release/release.sh`**

```bash
#!/usr/bin/env bash
# Release every language port at the same version. Idempotent: re-run the
# same command after a failure and it resumes where it left off.
#
#   release/release.sh <version>      (or: make release VERSION=<version>)
#   DRY_RUN=1   probe registries and print the plan; publish/mutate nothing
#   SKIP_GATE=1 skip `make check` (resumes where HEAD already passed the gate)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

VERSION="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_GATE="${SKIP_GATE:-0}"
TAG="v$VERSION"

# ── 1. Preflight (fail fast, zero side effects) ─────────────────────────────
[[ -n "$VERSION" ]] || die "usage: release/release.sh <version>"
is_semver "$VERSION" || die "not a semver version: $VERSION"

for tool in git node pnpm uv mvn gh vsce ovsx op gpg curl jq python3 make; do
  require_tool "$tool"
done

[[ "$(git branch --show-current)" == "main" ]] || die "releases run from main"
git diff --quiet && git diff --cached --quiet || die "working tree not clean"
git fetch origin main --tags
git merge-base --is-ancestor origin/main HEAD ||
  die "local main is behind (or diverged from) origin/main — pull first"

[[ -n "$(changelog_body "$VERSION")" ]] ||
  die "CHANGELOG.md has no non-empty '## [$VERSION]' section"

op run --env-file=release/release.env -- true >/dev/null 2>&1 ||
  die "cannot resolve secrets in release/release.env (is 'op' signed in? vault 'Var'?)"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  [[ "$(git rev-parse "$TAG^{commit}")" == "$(git rev-parse HEAD)" ]] ||
    die "tag $TAG exists but points at a different commit — if it is wrong, delete it (git tag -d $TAG && git push origin :refs/tags/$TAG) and re-run"
  log "tag $TAG already exists at HEAD (resuming)"
fi
log "preflight OK ($TAG)"

# ── 2. Gate ──────────────────────────────────────────────────────────────────
if [[ "$SKIP_GATE" == "1" ]]; then
  warn "skipping make check (SKIP_GATE=1)"
else
  make check
fi

# ── 3. Stamp ─────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run: skipping stamp/commit"
else
  release/stamp.sh "$VERSION"
  if git diff --quiet; then
    log "manifests already at $VERSION"
  else
    git add -A
    git commit -m "Release $TAG"
    log "committed version stamp"
  fi
fi

# ── 4. Tag ───────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run: skipping tag"
elif ! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  git tag -a "$TAG" -m "Release $TAG"
  log "created tag $TAG"
fi

# ── 5. Publish targets (all run; failures collected) ────────────────────────
RESULTS=()
FAILED=0
for target in release/targets/*.sh; do
  name="$(basename "$target" .sh)"
  log "── target $name ──"
  if DRY_RUN="$DRY_RUN" op run --env-file=release/release.env -- bash "$target" "$VERSION"; then
    RESULTS+=("$name: OK")
  else
    RESULTS+=("$name: FAILED")
    FAILED=1
  fi
done

# ── 6+7. Push and GitHub release (only when everything succeeded) ───────────
if [[ "$FAILED" == "0" && "$DRY_RUN" != "1" ]]; then
  git push origin main "$TAG"
  if gh release view "$TAG" >/dev/null 2>&1; then
    log "GitHub release $TAG already exists"
  else
    changelog_body "$VERSION" | gh release create "$TAG" --title "$TAG" --notes-file -
    log "created GitHub release $TAG"
  fi
fi

# ── 8. Summary ───────────────────────────────────────────────────────────────
log "──────── summary ────────"
for r in "${RESULTS[@]}"; do log "  $r"; done
[[ "$FAILED" == "0" ]] || die "some targets failed — fix and re-run: release/release.sh $VERSION"
[[ "$DRY_RUN" == "0" ]] && log "release $TAG complete 🎉" || log "dry run complete"
```

- [ ] **Step 2: Test preflight failure modes (no targets exist yet — that's fine, they come next)**

```bash
release/release.sh 2>&1 | tail -1                      # usage error
release/release.sh not-a-version 2>&1 | tail -1        # semver error
touch /tmp/dirt-$$ && cp /tmp/dirt-$$ dirt.tmp
release/release.sh 0.1.0 2>&1 | tail -1                # dirty tree error
rm dirt.tmp
release/release.sh 0.9.9 2>&1 | tail -1                # missing CHANGELOG section error
```

Expected, in order: `usage:` line, `not a semver version`, `working tree not clean`, `no non-empty '## [0.9.9]' section`. (If `op` is not signed in, the 0.9.9 case may hit the changelog error first regardless — that is the point: preflight order is argument → tools → git → changelog → op.)

- [ ] **Step 3: Commit**

```bash
chmod +x release/release.sh
git add release/release.sh
git commit -m "feat(release): idempotent release orchestrator"
```

---

### Task 6: npm target — `release/targets/10-npm.sh`

**Files:**
- Create: `release/targets/10-npm.sh`
- Modify: `typescript/.npmrc` (add registry auth line reading `NPM_TOKEN` from env)

**Interfaces:**
- Consumes: `lib.sh`; `NPM_TOKEN` in env; stamped package.json versions.
- Produces: all non-private workspace packages published at `<version>`.

- [ ] **Step 1: Add auth line to `typescript/.npmrc`**

Append (env-expanded at publish time; not a secret):

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

- [ ] **Step 2: Create `release/targets/10-npm.sh`**

```bash
#!/usr/bin/env bash
# Publish every non-private workspace package to npm. Idempotent per package.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"
cd "$REPO_ROOT/typescript"

pnpm install --frozen-lockfile
pnpm -r build

published=0 skipped=0
for pkgjson in packages/*/package.json; do
  name="$(jq -r .name "$pkgjson")"
  [[ "$(jq -r '.private // false' "$pkgjson")" == "true" ]] && continue
  if npm view "$name@$VERSION" version >/dev/null 2>&1; then
    log "npm: $name@$VERSION already published"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "npm: would publish $name@$VERSION"
    continue
  fi
  (cd "$(dirname "$pkgjson")" && pnpm publish --access public --no-git-checks)
  log "npm: published $name@$VERSION"
  published=$((published + 1))
done
log "npm: done ($published published, $skipped already present)"
```

- [ ] **Step 3: Test probe + dry-run behavior (no secrets needed for a dry run of unpublished versions)**

```bash
NPM_TOKEN=dummy DRY_RUN=1 bash release/targets/10-npm.sh 0.0.0 2>&1 | grep '^.*npm:' | head -12
```

Expected: one `would publish <name>@0.0.0` line per public package (8 lines), then the `done` summary; **no** line for `oselvar-var` (private since Task 1). If any `@oselvar/*@0.0.0` unexpectedly says "already published", stop and investigate.

- [ ] **Step 4: Commit**

```bash
chmod +x release/targets/10-npm.sh
git add release/targets/10-npm.sh typescript/.npmrc
git commit -m "feat(release): npm publish target (per-package idempotency probe)"
```

---

### Task 7: PyPI target — `release/targets/20-pypi.sh`

**Files:**
- Create: `release/targets/20-pypi.sh`

**Interfaces:**
- Consumes: `lib.sh`; `UV_PUBLISH_TOKEN` in env (uv reads it automatically); stamped pyprojects.
- Produces: all 5 Python packages published at `<version>`.

- [ ] **Step 1: Create `release/targets/20-pypi.sh`**

```bash
#!/usr/bin/env bash
# Publish every Python workspace package to PyPI. Idempotent per package.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"
cd "$REPO_ROOT/python"

rm -rf dist-release
published=0 skipped=0
for pyproject in packages/*/pyproject.toml; do
  name="$(python3 -c "import tomllib, sys; print(tomllib.load(open(sys.argv[1], 'rb'))['project']['name'])" "$pyproject")"
  if http_ok "https://pypi.org/pypi/$name/$VERSION/json"; then
    log "pypi: $name==$VERSION already published"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "pypi: would publish $name==$VERSION"
    continue
  fi
  uv build --package "$name" -o "dist-release/$name"
  uv publish "dist-release/$name"/*
  log "pypi: published $name==$VERSION"
  published=$((published + 1))
done
rm -rf dist-release
log "pypi: done ($published published, $skipped already present)"
```

- [ ] **Step 2: Test probe + dry-run**

```bash
DRY_RUN=1 bash release/targets/20-pypi.sh 0.0.0 2>&1 | grep 'pypi:'
```

Expected: 5 `would publish <name>==0.0.0` lines + summary. Also verify the probe's positive path against a real package: `bash -c 'source release/lib.sh; http_ok https://pypi.org/pypi/pytest/8.0.0/json && echo probe-positive-ok'` → `probe-positive-ok`.

- [ ] **Step 3: Commit**

```bash
chmod +x release/targets/20-pypi.sh
git add release/targets/20-pypi.sh
git commit -m "feat(release): PyPI publish target"
```

---

### Task 8: Maven Central build prerequisites (parent POM + Kotlin javadoc)

**Files:**
- Modify: `java/pom.xml` (project metadata + `release` profile)
- Modify: `java/var-kotlin/pom.xml`, `java/var-kotest/pom.xml` (Dokka javadoc jars)

**Interfaces:**
- Produces: `mvn -Prelease ... deploy` publishes to Central via `central-publishing-maven-plugin` using server id `central`; env `MAVEN_GPG_PASSPHRASE` unlocks signing. Every module emits `-sources.jar` and `-javadoc.jar`.

- [ ] **Step 1: Add Central-required metadata to `java/pom.xml`**

Insert after the closing `</description>`:

```xml
  <url>https://github.com/oselvar/var</url>
  <licenses>
    <license>
      <name>MIT License</name>
      <url>https://opensource.org/license/mit/</url>
      <distribution>repo</distribution>
    </license>
  </licenses>
  <developers>
    <developer>
      <id>aslakhellesoy</id>
      <name>Aslak Hellesøy</name>
      <organization>Oselvar Ltd</organization>
    </developer>
  </developers>
  <scm>
    <connection>scm:git:https://github.com/oselvar/var.git</connection>
    <developerConnection>scm:git:git@github.com:oselvar/var.git</developerConnection>
    <url>https://github.com/oselvar/var</url>
    <tag>HEAD</tag>
  </scm>
```

- [ ] **Step 2: Add the `release` profile to `java/pom.xml`** (before `</project>`; verify plugin versions per Global Constraints)

```xml
  <profiles>
    <profile>
      <id>release</id>
      <build>
        <plugins>
          <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-source-plugin</artifactId>
            <version>3.3.1</version>
            <executions>
              <execution>
                <id>attach-sources</id>
                <goals><goal>jar-no-fork</goal></goals>
              </execution>
            </executions>
          </plugin>
          <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-javadoc-plugin</artifactId>
            <version>3.11.2</version>
            <configuration>
              <doclint>none</doclint>
            </configuration>
            <executions>
              <execution>
                <id>attach-javadocs</id>
                <goals><goal>jar</goal></goals>
              </execution>
            </executions>
          </plugin>
          <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-gpg-plugin</artifactId>
            <version>3.2.7</version>
            <configuration>
              <!-- Reads the passphrase from MAVEN_GPG_PASSPHRASE (op-injected). -->
              <bestPractices>true</bestPractices>
            </configuration>
            <executions>
              <execution>
                <id>sign-artifacts</id>
                <phase>verify</phase>
                <goals><goal>sign</goal></goals>
              </execution>
            </executions>
          </plugin>
          <plugin>
            <groupId>org.sonatype.central</groupId>
            <artifactId>central-publishing-maven-plugin</artifactId>
            <version>0.8.0</version>
            <extensions>true</extensions>
            <configuration>
              <publishingServerId>central</publishingServerId>
              <autoPublish>true</autoPublish>
              <waitUntil>published</waitUntil>
            </configuration>
          </plugin>
        </plugins>
      </build>
    </profile>
  </profiles>
```

- [ ] **Step 3: Kotlin modules — skip javadoc plugin, attach Dokka javadoc jars**

In **both** `java/var-kotlin/pom.xml` and `java/var-kotest/pom.xml`: add `<maven.javadoc.skip>true</maven.javadoc.skip>` to the module's `<properties>` (create the block if absent), and add this before `</project>`:

```xml
  <profiles>
    <profile>
      <id>release</id>
      <build>
        <plugins>
          <plugin>
            <groupId>org.jetbrains.dokka</groupId>
            <artifactId>dokka-maven-plugin</artifactId>
            <version>2.0.0</version>
            <executions>
              <execution>
                <id>attach-javadoc-jar</id>
                <phase>package</phase>
                <goals><goal>javadocJar</goal></goals>
              </execution>
            </executions>
          </plugin>
        </plugins>
      </build>
    </profile>
  </profiles>
```

- [ ] **Step 4: Verify the release build produces all attachments (no GPG, no deploy)**

```bash
cd java && mvn --batch-mode -Prelease -DskipTests -Dgpg.skip=true package
ls var-core/target/*-sources.jar var-core/target/*-javadoc.jar \
   var-kotlin/target/*-sources.jar var-kotlin/target/*-javadoc.jar \
   var-kotest/target/*-javadoc.jar
```

Expected: build SUCCESS; every listed jar exists. If Dokka's `javadocJar` goal name differs in the verified plugin version, consult `mvn org.jetbrains.dokka:dokka-maven-plugin:help -Ddetail` and adjust.

- [ ] **Step 5: Verify the normal gate still passes**

Run: `cd java && mvn --batch-mode verify`
Expected: SUCCESS (release profile inactive by default).

- [ ] **Step 6: Commit**

```bash
git add java/pom.xml java/var-kotlin/pom.xml java/var-kotest/pom.xml
git commit -m "feat(release): Maven Central release profile (sign, sources, javadoc/dokka, central publishing)"
```

---

### Task 9: Maven Central target — `release/targets/30-maven-central.sh`

**Files:**
- Create: `release/targets/30-maven-central.sh`

**Interfaces:**
- Consumes: `lib.sh`; `CENTRAL_USERNAME`, `CENTRAL_PASSWORD`, `MAVEN_GPG_PASSPHRASE` in env; Task 8's release profile; `release/maven-settings.xml`.
- Produces: all 7 `com.oselvar` artifacts published at `<version>`.

- [ ] **Step 1: Create `release/targets/30-maven-central.sh`**

```bash
#!/usr/bin/env bash
# Publish all com.oselvar artifacts to Maven Central. The Central Portal
# treats a multi-module deploy as one atomic bundle, so this either deploys
# everything or skips everything; a partial state means a manual mess on the
# portal and gets a hard error.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"
cd "$REPO_ROOT/java"

AUTH="Authorization: Bearer $(printf '%s:%s' "$CENTRAL_USERNAME" "$CENTRAL_PASSWORD" | base64)"

central_published() {
  curl -fsS -H "$AUTH" \
    "https://central.sonatype.com/api/v1/publisher/published?namespace=com.oselvar&name=$1&version=$VERSION" \
    | jq -e '.published == true' >/dev/null
}

artifacts=(var-parent var-core var var-runner var-junit var-kotlin var-kotest)
missing=()
for artifact in "${artifacts[@]}"; do
  central_published "$artifact" || missing+=("$artifact")
done

if [[ ${#missing[@]} -eq 0 ]]; then
  log "maven: com.oselvar:*:$VERSION already published"
  exit 0
fi
if [[ ${#missing[@]} -lt ${#artifacts[@]} ]]; then
  die "maven: partial publication (missing: ${missing[*]}) — inspect https://central.sonatype.com/publishing before retrying"
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "maven: would deploy ${artifacts[*]} at $VERSION (running package as a sanity check)"
  mvn --batch-mode -Prelease -DskipTests -Dgpg.skip=true package >/dev/null
  log "maven: dry-run package OK"
  exit 0
fi

mvn --batch-mode -s "$REPO_ROOT/release/maven-settings.xml" -Prelease -DskipTests deploy
log "maven: deployed com.oselvar:*:$VERSION (waitUntil=published confirmed by the portal)"
```

- [ ] **Step 2: Test the probe shape against a public artifact (auth-free sanity of URL/jq wiring)**

The published-check endpoint needs credentials, so before they exist test only the dry-run deploy path with the probe stubbed:

```bash
CENTRAL_USERNAME=u CENTRAL_PASSWORD=p DRY_RUN=1 bash release/targets/30-maven-central.sh 0.0.0 2>&1 | tail -3
```

Expected: the probe calls fail auth → all 7 artifacts counted missing → `would deploy var-parent var-core var var-runner var-junit var-kotlin var-kotest at 0.0.0` → `dry-run package OK`. (Probe failure ⇒ "not published" is the correct conservative default; with real credentials the probe returns truthful answers. Verify this reasoning holds: `curl -fsS` on 401 exits non-zero → `central_published` false → artifact treated as missing.)

- [ ] **Step 3: Commit**

```bash
chmod +x release/targets/30-maven-central.sh
git add release/targets/30-maven-central.sh
git commit -m "feat(release): Maven Central publish target (atomic bundle, portal probe)"
```

---

### Task 10: Extension packaging — bundle extension + LSP server into a self-contained `.vsix`

**Files:**
- Create: `typescript/packages/var-vscode/esbuild.mjs`, `typescript/packages/var-vscode/.vscodeignore`, `typescript/packages/var-vscode/LICENSE` (copy of root), `typescript/packages/var-vscode/README.md` (if missing)
- Modify: `typescript/packages/var-vscode/package.json` (main → `dist/extension.cjs`, engines.vscode → `^1.125.0`, esbuild devDep, build script)
- Modify: `typescript/packages/var-vscode/src/extension.ts:37-52` (prefer dev sibling server, fall back to bundled)

**Interfaces:**
- Consumes: `typescript/packages/var-lsp/src/bin.ts` (LSP server entry — confirm it exists before bundling).
- Produces: `pnpm --filter oselvar-var build` emits `dist/extension.cjs` + `dist/server.cjs`; `vsce package --no-dependencies` yields a working `.vsix` (used by `build_vsix` from Task 3).

- [ ] **Step 1: Confirm the server entry and current dev flow**

Run: `ls typescript/packages/var-lsp/src/bin.ts && grep -n '"main"' typescript/packages/var-vscode/package.json`
Expected: `bin.ts` exists; main is `./dist/extension.js`.

- [ ] **Step 2: Add esbuild and rewire package.json**

From `typescript/`: `pnpm --filter oselvar-var add -D esbuild`

Then in `typescript/packages/var-vscode/package.json`:
- `"main": "./dist/extension.cjs"`
- `"engines": { "vscode": "^1.125.0", "node": ">=22" }` (vsce refuses `@types/vscode` newer than `engines.vscode`)
- `"scripts": { "build": "tsc -p tsconfig.json && node esbuild.mjs" }`

- [ ] **Step 3: Create `typescript/packages/var-vscode/esbuild.mjs`**

```js
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
}

// The extension itself. `vscode` is provided by the extension host.
await build({
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
})

// The LSP server, self-contained so the packaged .vsix needs no node_modules.
await build({
  ...shared,
  entryPoints: ['../var-lsp/src/bin.ts'],
  outfile: 'dist/server.cjs',
})
```

- [ ] **Step 4: Rewire server resolution in `src/extension.ts`**

Add `existsSync` to the `node:fs` import, then replace the server-options block (currently lines 42–52) with:

```ts
  // The symlink installer (T8) mirrors `packages/var-vscode/` into
  // ~/.vscode/extensions/. Resolve the symlink before walking `..` so we land
  // at the real `packages/` directory. When the sibling var-lsp checkout
  // exists we are in dev: run the live LSP sources through tsx. Otherwise we
  // are a packaged .vsix: use the bundled server next to the extension.
  const extReal = realpathSync(context.extensionPath)
  const devServer = resolve(extReal, '..', 'var-lsp', 'dist', 'bin.js')
  let serverOptions: ServerOptions
  if (existsSync(devServer)) {
    // `@oselvar/var`'s `exports.import` points at `src/index.ts` so we can run
    // tests without a build step. The LSP server reaches the core through that
    // same entry, so we need tsx to load `.ts` files at runtime.
    const tsxLoader = resolve(extReal, '..', '..', 'node_modules', 'tsx', 'dist', 'loader.mjs')
    const execArgv = ['--import', pathToFileURL(tsxLoader).href]
    serverOptions = {
      run: { module: devServer, transport: TransportKind.stdio, options: { execArgv } },
      debug: { module: devServer, transport: TransportKind.stdio, options: { execArgv } },
    }
  } else {
    const bundledServer = resolve(extReal, 'dist', 'server.cjs')
    serverOptions = {
      run: { module: bundledServer, transport: TransportKind.stdio },
      debug: { module: bundledServer, transport: TransportKind.stdio },
    }
  }
```

- [ ] **Step 5: Create `.vscodeignore`, LICENSE copy, README**

`typescript/packages/var-vscode/.vscodeignore`:

```
**
!dist/extension.cjs
!dist/server.cjs
!dist/*.map
!LICENSE
!README.md
```

Copy the license: `cp LICENSE typescript/packages/var-vscode/LICENSE`

If `typescript/packages/var-vscode/README.md` does not exist, create it:

```markdown
# Vár for VS Code

Markdown-native BDD: highlights matched steps, go-to step definition,
missing-step diagnostics, step generation and rename — driven by the
[var](https://github.com/oselvar/var) language server.
```

- [ ] **Step 6: Build and package**

```bash
cd typescript && pnpm install && pnpm --filter oselvar-var build
ls packages/var-vscode/dist/extension.cjs packages/var-vscode/dist/server.cjs
cd packages/var-vscode && vsce ls --no-dependencies
```

Expected: both bundles exist; `vsce ls` lists `dist/extension.cjs`, `dist/server.cjs`, `LICENSE`, `README.md`, `package.json` and nothing else of size. If `vsce` is not installed: `npm install -g @vscode/vsce`.

- [ ] **Step 7: Verify the full gate (the extension.ts change is type-checked source)**

Run: `cd typescript && pnpm build && pnpm check`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add typescript/packages/var-vscode typescript/pnpm-lock.yaml
git commit -m "feat(var-vscode): self-contained .vsix (esbuild bundle, bundled LSP server fallback)"
```

---

### Task 11: Marketplace + Open VSX targets — `40-vscode-marketplace.sh`, `50-open-vsx.sh`

**Files:**
- Create: `release/targets/40-vscode-marketplace.sh`, `release/targets/50-open-vsx.sh`

**Interfaces:**
- Consumes: `build_vsix` from `lib.sh`; `VSCE_PAT` / `OVSX_PAT` in env (both CLIs read those env vars natively).
- Produces: `oselvar.oselvar-var` at `<version>` on both marketplaces.

- [ ] **Step 1: Create `release/targets/40-vscode-marketplace.sh`**

```bash
#!/usr/bin/env bash
# Publish the extension to the VS Code Marketplace. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if vsce show oselvar.oselvar-var --json 2>/dev/null \
    | jq -e --arg v "$VERSION" '[.versions[]?.version] | index($v) != null' >/dev/null; then
  log "marketplace: oselvar.oselvar-var $VERSION already published"
  exit 0
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "marketplace: would build .vsix and publish $VERSION"
  exit 0
fi
vsix="$(build_vsix "$VERSION")"
vsce publish --packagePath "$vsix"
log "marketplace: published $VERSION"
```

- [ ] **Step 2: Create `release/targets/50-open-vsx.sh`**

```bash
#!/usr/bin/env bash
# Publish the extension to Open VSX. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if http_ok "https://open-vsx.org/api/oselvar/oselvar-var/$VERSION"; then
  log "open-vsx: oselvar.oselvar-var $VERSION already published"
  exit 0
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "open-vsx: would build .vsix and publish $VERSION"
  exit 0
fi
vsix="$(build_vsix "$VERSION")"
ovsx publish "$vsix"
log "open-vsx: published $VERSION"
```

- [ ] **Step 3: Test dry-run + probe wiring**

```bash
DRY_RUN=1 bash release/targets/40-vscode-marketplace.sh 0.0.0 2>&1 | tail -1
DRY_RUN=1 bash release/targets/50-open-vsx.sh 0.0.0 2>&1 | tail -1
bash -c 'source release/lib.sh; http_ok https://open-vsx.org/api/redhat/java/1.30.0 && echo openvsx-probe-ok'
```

Expected: `would build .vsix and publish 0.0.0` twice; `openvsx-probe-ok` (a known published extension version answers 200 — if redhat/java 1.30.0 is gone, use any version listed at https://open-vsx.org/extension/redhat/java).

- [ ] **Step 4: Commit**

```bash
chmod +x release/targets/40-vscode-marketplace.sh release/targets/50-open-vsx.sh
git add release/targets
git commit -m "feat(release): VS Code Marketplace and Open VSX publish targets"
```

---

### Task 12: `docs/RELEASING.md` — one-time setup + how to release

**Files:**
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Write `docs/RELEASING.md`**

```markdown
# Releasing

One command releases every port, lockstep-versioned:

    make release VERSION=0.1.0

Idempotent: if anything fails, fix the cause and re-run the **same** command.
Already-published artifacts are detected (registry probes) and skipped.
`DRY_RUN=1 release/release.sh 0.1.0` shows the plan without publishing;
`SKIP_GATE=1` skips `make check` when resuming a run that already passed it.

Before releasing: rename `## [Unreleased]` in `CHANGELOG.md` to
`## [x.y.z]` and commit. The release script refuses to run without that
section — it becomes the GitHub release notes.

What a release does: preflight checks → `make check` → stamp version into
every manifest + commit → tag `vX.Y.Z` → publish npm, PyPI, Maven Central,
VS Code Marketplace, Open VSX (each skipping what already exists) → push →
GitHub release.

## One-time setup

All secrets live in the 1Password vault **`Var`**, injected via `op run`
with the references in `release/release.env`. Never put a real secret in
the repo or your shell profile.

Local tools (macOS): `brew install pnpm uv maven gh gnupg 1password-cli jq`
and `npm install -g @vscode/vsce ovsx`. Sign in: `op signin`, `gh auth login`.

### 1. npm (`@oselvar` scope — exists)
Create a granular automation token with publish rights for the `@oselvar`
scope and the `oselvar-var`-adjacent public packages at
https://www.npmjs.com/settings → Access Tokens.
→ 1Password item `npm-oselvar`, field `token`.

### 2. PyPI
Create an account (enable 2FA) at https://pypi.org. Create an API token
(account-scoped for the first release; after the packages exist, replace it
with a project-scoped token covering oselvar-var, oselvar-var-core,
oselvar-var-runner, pytest-var, oselvar-var-unittest).
→ item `pypi-oselvar`, field `token` (the full `pypi-...` value).

### 3. Sonatype Central Portal (Maven Central)
1. Account at https://central.sonatype.com.
2. Register namespace `com.oselvar`; verify via the DNS TXT record it gives
   you on `oselvar.com`.
3. Generate a publishing token (Account → Generate User Token).
→ item `sonatype-central`, fields `username` and `token`.

### 4. GPG signing key
    gpg --quick-generate-key "Oselvar Ltd <aslak@oselvar.com>" ed25519 sign never
    gpg --keyserver keyserver.ubuntu.com --send-keys <KEYID>
→ item `maven-gpg`, field `passphrase`; attach an export
(`gpg --export-secret-keys --armor <KEYID>`) as a document for backup.

### 5. VS Code Marketplace
Publisher `oselvar` at https://marketplace.visualstudio.com/manage. Create an
Azure DevOps PAT with the **Marketplace → Manage** scope.
→ item `vscode-marketplace`, field `pat`.

### 6. Open VSX
Eclipse Foundation account at https://open-vsx.org, sign the publisher
agreement, create the namespace (`ovsx create-namespace oselvar -p <token>`),
generate an access token.
→ item `open-vsx`, field `pat`.

## Adding a new language port (Rust, Go, .NET, ...)

1. Add version stamping for the port's manifest(s) to `release/stamp.sh`.
2. Drop `release/targets/NN-<registry>.sh` following the existing contract:
   probe first (`is <name>@<version> already there?`), publish only what is
   missing, honor `DRY_RUN=1`, exit non-zero only on real failure.
3. Add the registry credential to `release/release.env` (`op://Var/...`)
   and its setup here.
```

- [ ] **Step 2: Commit**

```bash
git add docs/RELEASING.md
git commit -m "docs: RELEASING.md — one-time setup and release runbook"
```

---

### Task 13: End-to-end dry-run rehearsal

**Files:**
- Modify: `CHANGELOG.md` (rename `## [Unreleased]` → `## [0.1.0]` — this is real release prep, kept)

- [ ] **Step 1: Prepare the changelog for 0.1.0**

In `CHANGELOG.md`, change the line `## [Unreleased]` to `## [0.1.0]`. Commit:

```bash
git add CHANGELOG.md && git commit -m "docs: CHANGELOG section for 0.1.0"
git push origin main
```

(Push so the preflight "in sync with origin" check passes.)

- [ ] **Step 2: Full dry run**

```bash
DRY_RUN=1 release/release.sh 0.1.0
```

Expected: preflight OK → `make check` green → "dry-run: skipping stamp/commit" → "dry-run: skipping tag" → all five targets print `would publish ...` lines (npm: 8 packages; pypi: 5; maven: sanity `package` build OK; both marketplaces: "would build .vsix and publish") → summary shows five `OK` lines → "dry run complete". Zero mutations: `git status --porcelain` empty, `git tag -l v0.1.0` empty.

- [ ] **Step 3: Verify resumability behaviors that don't need credentials**

```bash
DRY_RUN=1 SKIP_GATE=1 release/release.sh 0.1.0   # fast re-run, same result
```

Expected: same summary, minus the `make check` time.

- [ ] **Step 4: Report readiness**

The real `release/release.sh 0.1.0` is blocked only on the one-time account
setup in `docs/RELEASING.md` (PyPI, Central, GPG, Marketplace PAT, Open VSX,
plus the 1Password `Var` items). Tell the user exactly which items to create
and confirm the expectation that the first Central deploy may need a re-run
(that is the designed resume path).
```
