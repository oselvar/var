#!/usr/bin/env bash
# Publish every Rust workspace crate to crates.io. Idempotent per crate.
#
# PARKED until the Rust port is ready to ship (gated by CRATES_IO_ENABLED in
# release/lib.sh, which keeps this target and the 70-varar-examples.sh rust pin in
# lock-step). While parked this simply reports OK. Go-live checklist:
#   1. Rename the facade crate — `var` was already TAKEN on crates.io, so the facade ships as `varar`
#      (verify `varar`/`varar-*` are free before first publish); the crate
#      names below and rust/varar/Cargo.toml already reflect this.
#   2. Flip each crate's `publish = false` to publishable and give them real
#      versions — the release stamper does not version the Rust port yet, so
#      wire that (they sit at 0.0.0 today).
#   3. Add `rust` to the consumer scopes in release/lint-commits.sh + cliff.toml.
#   4. Add the CARGO_REGISTRY_TOKEN reference to release/release.env (already
#      done — points at the 1Password `crates` item's `token`).
#   5. Set CRATES_IO_ENABLED=1 in release/lib.sh (un-parks this target AND the
#      varar-examples rust pin together).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if [[ "$CRATES_IO_ENABLED" != "1" ]]; then
  warn "crates-io: target parked (CRATES_IO_ENABLED=0) — see the header in ${BASH_SOURCE[0]} to enable"
  exit 0
fi

cd "$REPO_ROOT/rust"

# Publish in dependency order so a crate's deps exist on crates.io when it is
# pushed. crates.io indexes each publish before the next `cargo publish` can
# resolve it, so a brief wait between crates may be needed.
crates=(
  varar-core
  varar-config
  varar
  varar-runner
  varar-cargotest
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
