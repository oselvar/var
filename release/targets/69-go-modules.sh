#!/usr/bin/env bash
# Publish the Go port as a tagged Go module. Go modules are "published" simply by
# pushing a version tag on the module path (github.com/varar-dev/varar/go, rooted
# at go/, so the tag form is `go/vX.Y.Z`); the module proxy indexes it on first
# fetch. Idempotent — a tag that already exists is left alone.
#
# PARKED until the Go port is ready to ship (gated by GO_MODULES_ENABLED in
# release/lib.sh, which keeps this target and the 70-varar-examples.sh go pin in
# lock-step). While parked this simply reports OK. Go-live checklist:
#   1. Confirm the module path github.com/varar-dev/varar/go is the intended one
#      and the repo is public (the proxy only serves public modules).
#   2. Decide the tag scheme for a module in the go/ subdirectory
#      (`go/vX.Y.Z`), and wire the release stamper to create it (the Go module
#      carries no version file — the tag IS the version).
#   3. Add `go` to the consumer scopes in release/lint-commits.sh + cliff.toml
#      (already prepared behind GO_MODULES_ENABLED).
#   4. Set GO_MODULES_ENABLED=1 in release/lib.sh (un-parks this target AND the
#      varar-examples go pin together).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if [[ "$GO_MODULES_ENABLED" != "1" ]]; then
  warn "go-modules: target parked (GO_MODULES_ENABLED=0) — see the header in ${BASH_SOURCE[0]} to enable"
  exit 0
fi

require_tool git
cd "$REPO_ROOT"

TAG="go/v$VERSION"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  log "go-modules: $TAG already tagged"
  exit 0
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "go-modules: would tag $TAG and push"
  exit 0
fi
git tag "$TAG"
git push origin "$TAG"
log "go-modules: tagged and pushed $TAG"
