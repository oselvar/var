#!/usr/bin/env bash
# Remove a uv-managed .venv that was created under a different absolute path.
#
# uv bakes absolute paths into a venv's console-script shebangs and activate
# scripts, and `uv sync` / `uv run` do NOT rewrite them. So after the checkout
# is moved or renamed (e.g. the repo root going from `bdd` to `var`), every
# console script still points at the old interpreter path and fails to spawn
# ("error: Failed to spawn: `pytest`"). Deleting the stale venv lets the next
# `uv sync` / `uv run` recreate it with correct paths.
#
# A fresh checkout has no .venv (it is gitignored), so this is a no-op there.
#
# Usage: scripts/fresh-venv.sh <project-dir> [<project-dir> ...]
set -euo pipefail

for dir in "$@"; do
	venv="$dir/.venv"
	activate="$venv/bin/activate"
	[ -f "$activate" ] || continue

	# The venv records its own absolute path here; compare it to where it
	# actually lives now. A mismatch means the checkout was relocated.
	recorded="$(sed -n "s/^VIRTUAL_ENV=['\"]\{0,1\}\(.*[^'\"]\)['\"]\{0,1\}$/\1/p" "$activate" | head -1)"
	actual="$(cd "$venv" && pwd)"

	if [ "$recorded" != "$actual" ]; then
		echo "fresh-venv: $venv was created at '$recorded'; recreating for '$actual'"
		rm -rf "$venv"
	fi
done
