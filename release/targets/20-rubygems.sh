#!/usr/bin/env bash
# Publish every Ruby workspace gem to RubyGems. Idempotent per gem.
#
# The gemspecs set `rubygems_mfa_required = true`, so every push needs an OTP.
# Rather than prompt six times, we build all the pending gems first (no auth
# needed), then prompt ONCE and reuse that code for the whole batch via
# GEM_HOST_OTP_CODE — the pushes take a few seconds, well inside a TOTP window.
# If a code expires mid-batch, just re-run: already-pushed gems are skipped and
# you are prompted again for the rest.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

# Live from the first Ruby release: every workspace gem publishes on each
# release. Flip to 1 to park the target (it then warns and reports OK).
DISABLED=0
if [[ "$DISABLED" == "1" ]]; then
  warn "rubygems: target disabled — flip DISABLED=0 in ${BASH_SOURCE[0]} to re-enable"
  exit 0
fi

cd "$REPO_ROOT/ruby"

# Publish in dependency order so a gem's deps exist when it is pushed.
gems=(
  varar-core
  varar-config
  varar
  varar-runner
  varar-rspec
  varar-minitest
)

# The gem name no longer shares a prefix with its package directory (gem
# `varar-core` lives in `packages/var-core`), so locate each package by its
# gemspec rather than by stripping a name prefix.
gem_dir() { dirname "$(ls "$REPO_ROOT"/ruby/packages/*/"$1.gemspec")"; }

trap 'rm -f "$REPO_ROOT"/ruby/packages/*/*.gem' EXIT

# Which gems still need publishing? (RubyGems returns 200 for a published
# version, 404 otherwise.)
pending=()
skipped=0
for name in "${gems[@]}"; do
  if http_ok "https://rubygems.org/api/v1/versions/$name.json" \
     && gem list -r -e "$name" | grep -q "($VERSION"; then
    log "rubygems: $name $VERSION already published"
    skipped=$((skipped + 1))
  else
    pending+=("$name")
  fi
done

if [[ ${#pending[@]} -eq 0 ]]; then
  log "rubygems: done (0 published, $skipped already present)"
  exit 0
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  for name in "${pending[@]}"; do log "rubygems: would publish $name $VERSION"; done
  exit 0
fi

# Build every pending gem up front — no credentials needed, so this keeps the
# OTP-guarded pushes back-to-back and inside one code's validity window.
for name in "${pending[@]}"; do
  (cd "$(gem_dir "$name")" && gem build "$name.gemspec" -o "$name-$VERSION.gem" >/dev/null)
done

# One OTP for the whole batch. op run pipes our stdio to mask secrets, so read
# the code from the controlling terminal directly (same reason the npm target
# rebinds to /dev/tty).
{ : </dev/tty; } 2>/dev/null ||
  die "rubygems: publishing needs a terminal for the OTP — run the release interactively"
printf 'RubyGems OTP (one code for all %d gems): ' "${#pending[@]}" >/dev/tty
IFS= read -rs GEM_HOST_OTP_CODE </dev/tty
printf '\n' >/dev/tty
export GEM_HOST_OTP_CODE

published=0
for name in "${pending[@]}"; do
  (cd "$(gem_dir "$name")" && gem push "$name-$VERSION.gem")
  log "rubygems: published $name $VERSION"
  published=$((published + 1))
done
log "rubygems: done ($published published, $skipped already present)"
