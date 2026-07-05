#!/usr/bin/env bash
# Sync examples/ to the oselvar/var-examples repo, pinned to the release.
#
# The monorepo's examples/ directory IS the var-examples repo layout: this
# target wipes the destination (everything but .git), copies examples/ over
# with symlinks dereferenced (the subset projects' .md specs are symlinks to
# the typescript-vitest originals here, plain files there), rewrites the
# local/SNAPSHOT references to the released coordinates, and pushes.
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
  log "var-examples: dry-run — would sync examples/ -> $DEST pinned to $TAG and push"
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
# project ignores must not be synced.
rsync -a --copy-links \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude '.gradle/' \
  --exclude 'build/' \
  --exclude 'target/' \
  --exclude '.var/' \
  --exclude '__pycache__/' \
  --exclude '.pytest_cache/' \
  --exclude 'uv.lock' \
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

# Point the Python sample's uv sources at the release tag (PyPI is parked;
# git+tag sources give users a working `uv run pytest` with nothing else
# cloned). Drops the editable flag — a pinned tag is not editable.
perl -pi -e "s|\\{ path = \"\\.\\./\\.\\./python/packages/([^\"]+)\", editable = true \\}|{ git = \"https://github.com/oselvar/var\", subdirectory = \"python/packages/\$1\", tag = \"$TAG\" }|" \
  "$DEST"/python-pytest/pyproject.toml

git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  log "var-examples: already in sync with $TAG"
else
  git -C "$DEST" commit --quiet -m "Sync examples from oselvar/var $TAG"
  git -C "$DEST" push --quiet origin "$default_branch"
  log "var-examples: pushed sync for $TAG"
fi
