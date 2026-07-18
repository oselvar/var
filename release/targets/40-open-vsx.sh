#!/usr/bin/env bash
# Publish the extension to Open VSX. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if http_ok "https://open-vsx.org/api/varar/varar/$VERSION"; then
  log "open-vsx: varar.varar $VERSION already published"
  exit 0
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "open-vsx: would build .vsix and publish $VERSION"
  exit 0
fi
# The namespace must exist before the first publish (ovsx errors with
# "Unknown publisher" otherwise). Creating it is a one-time act; probe first
# so re-runs stay quiet. ovsx reads the token from $OVSX_PAT.
if ! http_ok "https://open-vsx.org/api/varar"; then
  ovsx create-namespace varar
  log "open-vsx: created namespace varar"
fi
vsix="$(build_vsix "$VERSION")"
ovsx publish "$vsix"
log "open-vsx: published $VERSION"
