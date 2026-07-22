#!/usr/bin/env bash
# Publish a prepared release, then tag it and announce it. Run AFTER
# release/prepare.sh has bumped the version + changelog and pushed the
# `Release vX.Y.Z` commit to main.
#
#   release/release.sh
#   DRY_RUN=1   probe registries and print the plan; publish/mutate nothing
#
# The version is whatever prepare stamped into the manifests — it is not
# inferred or passed here. Idempotent: re-run after a failed publish and it
# skips whatever is already out, then tags + creates the GitHub release once
# every registry is up. The tag is created LAST, so a failed publish never
# leaves a dangling tag.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

DRY_RUN="${DRY_RUN:-0}"

# The Varar vault lives in this account (several accounts are configured locally);
# release.env references the vault by ID — see the comment there.
export OP_ACCOUNT="${OP_ACCOUNT:-my.1password.com}"

# ── 1. Preflight ─────────────────────────────────────────────────────────────
for tool in git node pnpm uv mvn gem gh vsce ovsx op gpg curl jq python3 bundle go; do
  require_tool "$tool"
done

[[ "$(git branch --show-current)" == "main" ]] || die "releases run from main"
[[ -z "$(git status --porcelain)" ]] || die "working tree not clean"
git fetch origin main --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] ||
  die "local main and origin/main differ — run release right after prepare (git pull if needed)"

# The prepared version is whatever prepare stamped into the manifests.
VERSION="$(jq -r .version typescript/packages/varar/package.json)"
is_semver "$VERSION" ||
  die "typescript/packages/varar/package.json version '$VERSION' is not semver — did prepare run?"
TAG="v$VERSION"

git log -1 --pretty=%s | grep -qx "Release $TAG" ||
  warn "HEAD is not a 'Release $TAG' commit — continuing, but confirm prepare ran for $VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  [[ "$(git rev-parse "$TAG^{commit}")" == "$(git rev-parse HEAD)" ]] ||
    die "tag $TAG exists but points elsewhere — delete it (git tag -d $TAG && git push origin :refs/tags/$TAG) and re-run"
  log "tag $TAG already exists at HEAD (resuming)"
fi

op run --env-file=release/release.env -- true >/dev/null 2>&1 ||
  die "cannot resolve secrets in release/release.env (is 'op' signed in? vault 'Varar'?)"

[[ -n "$(changelog_body "$VERSION")" ]] ||
  die "CHANGELOG.md has no [$VERSION] section — did prepare run?"
log "preflight OK ($TAG)"

# ── 2. Publish targets (all run; failures collected) ─────────────────────────
RESULTS=()
FAILED=0
for target in release/targets/*.sh; do
  [[ -e "$target" ]] || die "no release targets found in release/targets/"
  name="$(basename "$target" .sh)"
  log "── target $name ──"
  if DRY_RUN="$DRY_RUN" op run --env-file=release/release.env -- bash "$target" "$VERSION"; then
    RESULTS+=("$name: OK")
  else
    RESULTS+=("$name: FAILED")
    FAILED=1
  fi
done

log "──────── summary ────────"
for r in ${RESULTS[@]+"${RESULTS[@]}"}; do log "  $r"; done
[[ "$FAILED" == "0" ]] || die "some targets failed — fix and re-run: make release"

if [[ "$DRY_RUN" == "1" ]]; then
  log "dry run complete"
  exit 0
fi

# ── 3. Tag (now that every registry is up) ───────────────────────────────────
if ! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  git tag -a "$TAG" -m "Release $TAG"
  log "tagged $TAG"
fi
git push origin "$TAG"

# ── 4. GitHub release ────────────────────────────────────────────────────────
if gh release view "$TAG" >/dev/null 2>&1; then
  log "GitHub release $TAG already exists"
else
  changelog_body "$VERSION" | gh release create "$TAG" --title "$TAG" --notes-file -
  log "created GitHub release $TAG"
fi

# ── 5. Java back to a SNAPSHOT placeholder ───────────────────────────────────
# Trunk gates the java sample projects against the local build (mvn install →
# mavenLocal), so between releases java must NOT carry the released version — a
# local install would shadow the immutable release in ~/.m2. (Ruby has no such
# constraint, so its gems stay stamped at the released version.)
if grep -q -- '-SNAPSHOT' java/pom.xml; then
  log "java already on a SNAPSHOT placeholder"
else
  release/bump-java-snapshot.sh
  git add java/pom.xml java/*/pom.xml examples/*/build.gradle.kts examples/java-junit-maven/pom.xml
  git commit -m "chore(release): java back to a SNAPSHOT placeholder after $TAG"
  git push origin main
  log "java bumped to the post-$VERSION SNAPSHOT placeholder"
fi

log "release $TAG complete 🎉"
