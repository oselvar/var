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

# The Vár vault lives in this account (several accounts are configured locally);
# release.env references the vault by ID — see the comment there.
export OP_ACCOUNT="${OP_ACCOUNT:-my.1password.com}"

# ── 1. Preflight (fail fast, zero side effects) ─────────────────────────────
[[ -n "$VERSION" ]] || die "usage: release/release.sh <version>"
is_semver "$VERSION" || die "not a semver version: $VERSION"

for tool in git node pnpm uv mvn gh vsce ovsx op gpg curl jq python3 make; do
  require_tool "$tool"
done

[[ "$(git branch --show-current)" == "main" ]] || die "releases run from main"
[[ -z "$(git status --porcelain)" ]] || die "working tree not clean"
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
    git add typescript/packages/*/package.json python/packages/*/pyproject.toml python/uv.lock java/pom.xml java/*/pom.xml
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
for r in ${RESULTS[@]+"${RESULTS[@]}"}; do log "  $r"; done
[[ "$FAILED" == "0" ]] || die "some targets failed — fix and re-run: release/release.sh $VERSION"
if [[ "$DRY_RUN" == "0" ]]; then
  log "release $TAG complete 🎉"
else
  log "dry run complete"
fi
