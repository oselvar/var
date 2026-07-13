#!/usr/bin/env bash
# Publish every Rust workspace crate to crates.io. Idempotent per crate.
#
# PARKED until the Rust port is ready to ship: the crates are `publish = false`
# in their Cargo.toml and their crates.io names are unclaimed, so this target is
# disabled and simply reports OK. To go live: verify/claim the crate names, flip
# each crate's `publish = false` to a real version, add `rust` to the consumer
# scopes in release/lint-commits.sh + cliff.toml, un-inert the Cargo pin block
# in 70-var-examples.sh, and set DISABLED=0 here.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

DISABLED=1
if [[ "$DISABLED" == "1" ]]; then
  warn "crates-io: target parked — see the header in ${BASH_SOURCE[0]} to enable"
  exit 0
fi

cd "$REPO_ROOT/rust"

# Publish in dependency order so a crate's deps exist on crates.io when it is
# pushed. crates.io indexes each publish before the next `cargo publish` can
# resolve it, so a brief wait between crates may be needed.
crates=(
  var-core
  var-config
  var
  var-runner
  var-cargotest
)

for name in "${crates[@]}"; do
  if cargo search "$name" 2>/dev/null | grep -q "^$name = \"$VERSION\""; then
    log "crates-io: $name $VERSION already published"
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "crates-io: would publish $name $VERSION"
    continue
  fi
  (cd "$name" && cargo publish)
  log "crates-io: published $name $VERSION"
done
log "crates-io: done"
