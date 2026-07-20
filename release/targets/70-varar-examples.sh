#!/usr/bin/env bash
# Sync examples/ to the varar-dev/varar-examples repo, pinned to the release.
#
# The monorepo's examples/ directory IS the varar-examples repo layout: this
# target wipes the destination (everything but .git), copies examples/ over
# with symlinks dereferenced (the subset projects' .md specs are symlinks to
# the typescript-vitest originals here, plain files there), rewrites the
# local/SNAPSHOT references to the released coordinates, pushes, and tags the
# varar-examples repo with the same v<version> tag as the release.
#
# Override the checkout location with VARAR_EXAMPLES_DIR (default: a sibling
# clone at ../varar-examples; cloned via gh if missing).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"
TAG="v$VERSION"
cd "$REPO_ROOT"

DEST="${VARAR_EXAMPLES_DIR:-$REPO_ROOT/../varar-examples}"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "varar-examples: dry-run — would sync examples/ -> $DEST pinned to $TAG, push, and tag $TAG"
  exit 0
fi

if [[ ! -d "$DEST/.git" ]]; then
  log "varar-examples: cloning varar-dev/varar-examples to $DEST"
  gh repo clone varar-dev/varar-examples "$DEST" -- --quiet || die "varar-examples: clone failed"
fi
[[ -z "$(git -C "$DEST" status --porcelain)" ]] || die "varar-examples: working tree at $DEST not clean"
default_branch="$(git -C "$DEST" symbolic-ref --short HEAD)"
git -C "$DEST" pull --ff-only --quiet || true # empty repo has no upstream yet

# Everything in varar-examples comes from examples/ — remove all tracked and
# untracked content (except .git) so deletions here propagate there.
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

# --copy-links dereferences the .md symlinks; local build/venv/cache dirs and
# the path-source lockfile stay behind (users resolve fresh from the pins).
# Keep this list in step with the examples/**/.gitignore files — anything a
# project ignores must not be synced. pnpm-workspace.yaml is monorepo-only
# plumbing (lets `pnpm test` run inside typescript-vitest, see the comment
# there); in varar-examples the deps are real versions and pnpm's defaults work.
# While crates.io publishing is parked, omit the rust-* samples: var-core isn't
# on crates.io, so a synced rust sample couldn't resolve it (its path source is
# monorepo-only). CRATES_IO_ENABLED (lib.sh) flips this and the pin block below
# together — see 65-crates-io.sh's go-live checklist.
rust_exclude=()
if [[ "$CRATES_IO_ENABLED" != "1" ]]; then
  rust_exclude+=(--exclude 'rust-*/')
fi
# Same story for the C# sample while NuGet publishing is parked: it references
# dotnet/ by project path, so a synced copy couldn't resolve Varar until the
# packages are on NuGet. DOTNET_NUGET_ENABLED (lib.sh) flips this and the pin
# block below together — see 68-nuget.sh's go-live checklist.
csharp_exclude=()
if [[ "$DOTNET_NUGET_ENABLED" != "1" ]]; then
  csharp_exclude+=(--exclude 'csharp-*/')
fi
# Same story for the Go sample while module publishing is parked: its go.mod
# `replace`s the module to go/ in-repo, which a synced copy couldn't resolve
# until the module is tagged. GO_MODULES_ENABLED (lib.sh) flips this and the pin
# block below together — see 69-go-modules.sh's go-live checklist.
go_exclude=()
if [[ "$GO_MODULES_ENABLED" != "1" ]]; then
  go_exclude+=(--exclude 'go-*/')
fi
rsync -a --copy-links \
  --exclude 'node_modules/' \
  --exclude 'pnpm-workspace.yaml' \
  --exclude '.venv/' \
  --exclude '.gradle/' \
  --exclude 'build/' \
  --exclude 'target/' \
  --exclude '.var/' \
  --exclude '__pycache__/' \
  --exclude '.pytest_cache/' \
  --exclude 'uv.lock' \
  --exclude 'Gemfile.lock' \
  --exclude 'Cargo.lock' \
  "${rust_exclude[@]}" \
  "${csharp_exclude[@]}" \
  "${go_exclude[@]}" \
  examples/ "$DEST"/

# Pin the JVM samples to the released Maven Central artifacts (idempotent even
# when stamp.sh already set the version), drop the mavenLocal() repository, and
# swap the trunk-facing comments for release-facing ones.
perl -pi -e "s/^val varVersion = \".*\"/val varVersion = \"$VERSION\"/" "$DEST"/*/build.gradle.kts
perl -pi -e "s|<var\.version>[^<]*</var\.version>|<var.version>$VERSION</var.version>|" \
  "$DEST"/java-junit-maven/pom.xml
perl -ni -e 'print unless /^\s*mavenLocal\(\)\s*$/' "$DEST"/*/build.gradle.kts
perl -0pi -e 's|// On trunk this is the SNAPSHOT that `mvn install` \(run from java/\) puts into\n// mavenLocal, so the sample always tests the code in this repo\. In your own\n// project: pin the latest release and drop the mavenLocal\(\) repository\.|// The released Varar version from Maven Central.|' \
  "$DEST"/*/build.gradle.kts
perl -0pi -e 's|<!-- On trunk this is the SNAPSHOT that `mvn install` \(run from java/\)\n         puts into the local repository, so the sample always tests the code\n         in this repo\. In your own project: pin the latest release\. -->|<!-- The released Varar version from Maven Central. -->|' \
  "$DEST"/java-junit-maven/pom.xml

# Pin the TypeScript sample to the released npm packages.
perl -pi -e "s/\"workspace:\\*\"/\"^$VERSION\"/g" "$DEST"/typescript-vitest/package.json

# Pin the Python samples to the released PyPI version: delete the
# [tool.uv.sources] path-source table (with its comment block) and pin the
# adapter dependency. Never rewrite to git sources — this monorepo is
# private, so anonymous CI in varar-examples cannot fetch git+tag pins.
perl -0pi -e 's|(#[^\n]*\n)+\[tool\.uv\.sources\]\n([\w.-]+ = \{ path = [^\n]+\n)+\n||' \
  "$DEST"/python-*/pyproject.toml
perl -pi -e "s/\"(pytest-varar|varar[\\w-]*)\"/\"\$1==$VERSION\"/" \
  "$DEST"/python-*/pyproject.toml

# Pin the Ruby samples to the released RubyGems version: swap each path source
# for an exact version constraint. Gemfile.lock is excluded from the sync
# (above), so `bundle install` regenerates it against the pins.
#
# Accepts either quote style and emits single, so the substitution cannot be
# silently defeated by a restyle: matching only double quotes meant a rubocop
# autocorrect on the sample Gemfiles would leave this a no-op and publish the
# samples still pointing at local monorepo paths.
perl -pi -e "s|, path: ['\"]\\.\\./\\.\\./ruby/packages/[\\w-]+['\"]|, '$VERSION'|" \
  "$DEST"/ruby-*/Gemfile

# Pin the Rust sample to the released crates.io version: swap the varar-core path
# dependency for a version constraint. Only runs once crates.io publishing is
# live (CRATES_IO_ENABLED=1); while parked the rust-* samples aren't synced at
# all (see the rsync exclude above), so this would have nothing to rewrite.
if [[ "$CRATES_IO_ENABLED" == "1" ]]; then
  perl -pi -e "s|varar-core = \{ path = \"\\.\\./\\.\\./rust/core\" \}|varar-core = \"$VERSION\"|" \
    "$DEST"/rust-*/Cargo.toml
fi

# Pin the C# sample to the released NuGet packages: swap each dotnet/ project
# reference for a PackageReference at the release version. The project path
# encodes the package id (…/Varar/Varar.csproj → Varar). Only runs once NuGet
# publishing is live (DOTNET_NUGET_ENABLED=1); while parked the csharp-* samples
# aren't synced at all (see the rsync exclude above), so this finds nothing.
if [[ "$DOTNET_NUGET_ENABLED" == "1" ]]; then
  perl -pi -e "s|<ProjectReference Include=\"\\.\\./\\.\\./dotnet/[\\w.]+/([\\w.]+)\\.csproj\" />|<PackageReference Include=\"\$1\" Version=\"$VERSION\" />|" \
    "$DEST"/csharp-*/*.csproj
fi

# Pin the Go sample to the released module: drop the `replace ... => ../../go`
# directive (path source is monorepo-only) and pin the require to the tagged
# version. Only runs once module publishing is live (GO_MODULES_ENABLED=1);
# while parked the go-* samples aren't synced at all (see the rsync exclude
# above), so this finds nothing.
if [[ "$GO_MODULES_ENABLED" == "1" ]]; then
  perl -ni -e 'print unless m{^replace github\.com/varar-dev/varar-go => }' \
    "$DEST"/go-*/go.mod
  perl -pi -e "s|(github\.com/varar-dev/varar-go) v[0-9][\\w.+-]*|\$1 v$VERSION|" \
    "$DEST"/go-*/go.mod
fi

git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  log "varar-examples: already in sync with $TAG"
else
  git -C "$DEST" commit --quiet -m "Sync examples from varar-dev/varar $TAG"
  git -C "$DEST" push --quiet origin "$default_branch"
  log "varar-examples: pushed sync for $TAG"
fi

# Tag the synced state with the release version (outside the commit branch so
# a rerun after a failed tag push still tags).
if ! git -C "$DEST" rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null; then
  git -C "$DEST" tag "$TAG"
fi
git -C "$DEST" push --quiet origin "refs/tags/$TAG"
log "varar-examples: tagged $TAG"
