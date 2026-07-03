#!/usr/bin/env bash
# Shared helpers for release scripts. Source this; do not execute it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[release]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[release]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

require_tool() { command -v "$1" >/dev/null 2>&1 || die "required tool not on PATH: $1"; }

is_semver() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

# 0 iff the URL answers 2xx.
http_ok() { curl -fsSL -o /dev/null "$1" 2>/dev/null; }

# Everything before v0.1.0 predates the conventional-commit convention; that
# release is kept verbatim in cliff.toml's `footer`, and generation starts here.
CHANGELOG_SINCE="v0.1.0"

# Print the changelog generated from conventional commits (cliff.toml).
# With an argument (a `vX.Y.Z` tag), unreleased commits are folded into that
# version's section; without, they render under `## [Unreleased]`.
generate_changelog() {
  git-cliff "$CHANGELOG_SINCE.." ${1:+--tag "$1"}
}

# Print the body of the `## [x.y.z]` section (up to the next `## [`) on stdin.
changelog_section() {
  awk -v ver="$1" '
    /^## \[/ { if (found) exit; if (index($0, "## [" ver "]") == 1) { found = 1; next } }
    found { print }
  '
}

# Print the body of the `## [x.y.z]` CHANGELOG.md section.
changelog_body() {
  changelog_section "$1" < "$REPO_ROOT/CHANGELOG.md"
}

# Build the extension .vsix once per version; marketplace + Open VSX share it.
# Prints the .vsix path on stdout (all build noise goes to stderr).
build_vsix() {
  local version="$1"
  local vsix="$REPO_ROOT/release/dist/oselvar-var-$version-$(git -C "$REPO_ROOT" rev-parse --short HEAD).vsix"
  [[ -f "$vsix" ]] && { echo "$vsix"; return 0; }
  local manifest_version
  manifest_version="$(jq -r .version "$REPO_ROOT/typescript/packages/var-vscode/package.json")"
  [[ "$manifest_version" == "$version" ]] ||
    die "var-vscode/package.json is at $manifest_version, not $version — stamp has not run"
  mkdir -p "$REPO_ROOT/release/dist"
  (cd "$REPO_ROOT/typescript" && pnpm install --frozen-lockfile >&2 && pnpm --filter oselvar-var build >&2)
  (cd "$REPO_ROOT/typescript/packages/var-vscode" && vsce package --no-dependencies -o "$vsix" >&2)
  echo "$vsix"
}
