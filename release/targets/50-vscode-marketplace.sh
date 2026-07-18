#!/usr/bin/env bash
# Publish the extension to the VS Code Marketplace. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

# Flip to 0 once the marketplace credentials are set up (doc/RELEASING.md §5:
# publisher + Azure DevOps PAT → 1Password item `vscode-marketplace`).
DISABLED=1
if [[ "$DISABLED" == "1" ]]; then
  warn "marketplace: target disabled — flip DISABLED=0 in ${BASH_SOURCE[0]} to re-enable"
  exit 0
fi

listing="$(vsce show varar.varar --json 2>/dev/null || true)"
if [[ -n "$listing" ]] && jq -e --arg v "$VERSION" '[.versions[]?.version] | index($v) != null' >/dev/null 2>&1 <<<"$listing"; then
  log "marketplace: varar.varar $VERSION already published"
  exit 0
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "marketplace: would build .vsix and publish $VERSION"
  exit 0
fi
vsix="$(build_vsix "$VERSION")"
vsce publish --packagePath "$vsix"
log "marketplace: published $VERSION"
