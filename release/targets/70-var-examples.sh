#!/usr/bin/env bash
# Sync examples/ to the oselvar/var-examples repo, pinned to the release.
#
# The monorepo's examples/ directory IS the var-examples repo layout: this
# target wipes the destination (everything but .git), copies examples/ over
# with symlinks dereferenced (the subset projects' .md specs are symlinks to
# the typescript-vitest originals here, plain files there), rewrites the
# local/SNAPSHOT references to the released coordinates, pushes, and tags the
# var-examples repo with the same v<version> tag as the release.
#
# Override the checkout location with VAR_EXAMPLES_DIR (default: a sibling
# clone at ../var-examples; cloned via gh if missing).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"
TAG="v$VERSION"
cd "$REPO_ROOT"

DEST="${VAR_EXAMPLES_DIR:-$REPO_ROOT/../var-examples}"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "var-examples: dry-run — would sync examples/ -> $DEST pinned to $TAG, push, and tag $TAG"
  exit 0
fi

if [[ ! -d "$DEST/.git" ]]; then
  log "var-examples: cloning oselvar/var-examples to $DEST"
  gh repo clone oselvar/var-examples "$DEST" -- --quiet || die "var-examples: clone failed"
fi
[[ -z "$(git -C "$DEST" status --porcelain)" ]] || die "var-examples: working tree at $DEST not clean"
default_branch="$(git -C "$DEST" symbolic-ref --short HEAD)"
git -C "$DEST" pull --ff-only --quiet || true # empty repo has no upstream yet

# Everything in var-examples comes from examples/ — remove all tracked and
# untracked content (except .git) so deletions here propagate there.
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

# --copy-links dereferences the .md symlinks; local build/venv/cache dirs and
# the path-source lockfile stay behind (users resolve fresh from the pins).
# Keep this list in step with the examples/**/.gitignore files — anything a
# project ignores must not be synced. pnpm-workspace.yaml is monorepo-only
# plumbing (lets `pnpm test` run inside typescript-vitest, see the comment
# there); in var-examples the deps are real versions and pnpm's defaults work.
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
  examples/ "$DEST"/

# Pin the JVM samples to the released Maven Central artifacts (idempotent even
# when stamp.sh already set the version), drop the mavenLocal() repository, and
# swap the trunk-facing comments for release-facing ones.
perl -pi -e "s/^val varVersion = \".*\"/val varVersion = \"$VERSION\"/" "$DEST"/*/build.gradle.kts
perl -pi -e "s|<var\.version>[^<]*</var\.version>|<var.version>$VERSION</var.version>|" \
  "$DEST"/java-junit-maven/pom.xml
perl -ni -e 'print unless /^\s*mavenLocal\(\)\s*$/' "$DEST"/*/build.gradle.kts
perl -0pi -e 's|// On trunk this is the SNAPSHOT that `mvn install` \(run from java/\) puts into\n// mavenLocal, so the sample always tests the code in this repo\. In your own\n// project: pin the latest release and drop the mavenLocal\(\) repository\.|// The released Vár version from Maven Central.|' \
  "$DEST"/*/build.gradle.kts
perl -0pi -e 's|<!-- On trunk this is the SNAPSHOT that `mvn install` \(run from java/\)\n         puts into the local repository, so the sample always tests the code\n         in this repo\. In your own project: pin the latest release\. -->|<!-- The released Vár version from Maven Central. -->|' \
  "$DEST"/java-junit-maven/pom.xml

# Pin the TypeScript sample to the released npm packages.
perl -pi -e "s/\"workspace:\\*\"/\"^$VERSION\"/g" "$DEST"/typescript-vitest/package.json

# Pin the Python samples to the released PyPI version: delete the
# [tool.uv.sources] path-source table (with its comment block) and pin the
# adapter dependency. Never rewrite to git sources — this monorepo is
# private, so anonymous CI in var-examples cannot fetch git+tag pins.
perl -0pi -e 's|(#[^\n]*\n)+\[tool\.uv\.sources\]\n([\w.-]+ = \{ path = [^\n]+\n)+\n||' \
  "$DEST"/python-*/pyproject.toml
perl -pi -e "s/\"(pytest-var|oselvar-var[\\w-]*)\"/\"\$1==$VERSION\"/" \
  "$DEST"/python-*/pyproject.toml

# Pin the Ruby samples to the released RubyGems version: swap each path source
# for an exact version constraint. Gemfile.lock is excluded from the sync
# (above), so `bundle install` regenerates it against the pins.
perl -pi -e "s|, path: \"\\.\\./\\.\\./ruby/packages/[\\w-]+\"|, \"$VERSION\"|" \
  "$DEST"/ruby-*/Gemfile

# Pin the Rust sample to the released crates.io version: swap the var-core
# path dependency for a version constraint. Inert until var-core is published
# to crates.io (the Rust port has no release target yet); kept here so the
# sync stays correct the moment it is.
perl -pi -e "s|var-core = \{ path = \"\\.\\./\\.\\./rust/var-core\" \}|var-core = \"$VERSION\"|" \
  "$DEST"/rust-*/Cargo.toml

git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  log "var-examples: already in sync with $TAG"
else
  git -C "$DEST" commit --quiet -m "Sync examples from oselvar/var $TAG"
  git -C "$DEST" push --quiet origin "$default_branch"
  log "var-examples: pushed sync for $TAG"
fi

# Tag the synced state with the release version (outside the commit branch so
# a rerun after a failed tag push still tags).
if ! git -C "$DEST" rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null; then
  git -C "$DEST" tag "$TAG"
fi
git -C "$DEST" push --quiet origin "refs/tags/$TAG"
log "var-examples: tagged $TAG"
