#!/usr/bin/env bash
# Publish every Python workspace package to PyPI. Idempotent per package.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"
cd "$REPO_ROOT/python"

trap 'rm -rf "$REPO_ROOT/python/dist-release"' EXIT

rm -rf dist-release
published=0 skipped=0
for pyproject in packages/*/pyproject.toml; do
  name="$(python3 -c "import tomllib, sys; print(tomllib.load(open(sys.argv[1], 'rb'))['project']['name'])" "$pyproject")"
  if http_ok "https://pypi.org/pypi/$name/$VERSION/json"; then
    log "pypi: $name==$VERSION already published"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "pypi: would publish $name==$VERSION"
    continue
  fi
  uv build --package "$name" -o "dist-release/$name"
  uv publish "dist-release/$name"/*
  log "pypi: published $name==$VERSION"
  published=$((published + 1))
done
rm -rf dist-release
log "pypi: done ($published published, $skipped already present)"
