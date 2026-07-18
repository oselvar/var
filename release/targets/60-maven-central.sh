#!/usr/bin/env bash
# Publish all dev.varar artifacts to Maven Central. The Central Portal
# treats a multi-module deploy as one atomic bundle, so this either deploys
# everything or skips everything; a partial state means a manual mess on the
# portal and gets a hard error.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

# Flip to 1 to park this target (it warns and reports OK). Credentials:
# doc/RELEASING.md → 1Password item `sonatype-central`.
DISABLED=0
if [[ "$DISABLED" == "1" ]]; then
  warn "maven: target disabled — flip DISABLED=0 in ${BASH_SOURCE[0]} to re-enable"
  exit 0
fi

cd "$REPO_ROOT/java"

AUTH="Authorization: Bearer $(printf '%s:%s' "$CENTRAL_USERNAME" "$CENTRAL_PASSWORD" | base64)"

# 0 iff the artifact is already on Central. Dies on 401/403 — an auth failure
# would otherwise read as "not published" here and then fail the deploy anyway,
# drowning the real cause in per-artifact curl noise.
central_published() {
  local body status
  body="$(curl -sS -w '\n%{http_code}' -H "$AUTH" \
    "https://central.sonatype.com/api/v1/publisher/published?namespace=dev.varar&name=$1&version=$VERSION")"
  status="${body##*$'\n'}"
  case "$status" in
    401 | 403) die "maven: Central Portal rejected the credentials (HTTP $status) — check the sonatype-central item in 1Password (doc/RELEASING.md §3)" ;;
    200) ;;
    *) die "maven: unexpected HTTP $status probing $1@$VERSION on Central" ;;
  esac
  printf '%s' "${body%$'\n'*}" | jq -e '.published == true' >/dev/null
}

artifacts=(parent core config varar runner junit kotlin kotest)
missing=()
for artifact in "${artifacts[@]}"; do
  central_published "$artifact" || missing+=("$artifact")
done

if [[ ${#missing[@]} -eq 0 ]]; then
  log "maven: dev.varar:*:$VERSION already published"
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
log "maven: deployed dev.varar:*:$VERSION (waitUntil=published confirmed by the portal)"
