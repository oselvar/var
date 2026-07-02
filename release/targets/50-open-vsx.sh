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
