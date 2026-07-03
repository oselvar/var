#!/usr/bin/env bash
# Regenerate CHANGELOG.md from conventional commit messages (see cliff.toml).
#
#   release/changelog.sh            # releases + current [Unreleased] section
#   release/changelog.sh v0.2.0     # fold unreleased commits into ## [0.2.0]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

require_tool git-cliff
tmp="$(mktemp)"
generate_changelog "${1:-}" > "$tmp"
mv "$tmp" CHANGELOG.md
log "regenerated CHANGELOG.md${1:+ for $1}"
