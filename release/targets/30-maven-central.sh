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
