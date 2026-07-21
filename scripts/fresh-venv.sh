#!/usr/bin/env bash
# Remove a uv-managed .venv that no longer matches the checkout — either because
# the checkout MOVED, or because a package in it was RENAMED or removed.
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
		continue
	fi

	# Stale by CONTENT rather than by path. `uv sync` installs the workspace
	# packages as editables and prunes what the lockfile still names — but a
	# package that was RENAMED leaves its old distribution behind untouched,
	# because uv no longer knows about it. That is not cosmetic: pytest loads
	# every registered `pytest11` entry point, so a leftover pre-rename plugin
	# (pytest_var -> var_pytest.plugin) aborts the whole run with
	# ModuleNotFoundError, even though the current plugin is installed and fine.
	#
	# The path check above cannot see this: the varar rename changed package
	# names while the checkout stayed put. An editable .pth pointing at a
	# directory that no longer exists is the general signal — it catches
	# renames, moves and deletions alike.
	stale_pth=""
	for pth in "$venv"/lib/python*/site-packages/*.pth; do
		[ -f "$pth" ] || continue
		while IFS= read -r line || [ -n "$line" ]; do
			case "$line" in
			/*) [ -e "$line" ] || stale_pth="$pth -> $line" ;;
			esac
		done <"$pth"
		[ -n "$stale_pth" ] && break
	done

	if [ -n "$stale_pth" ]; then
		echo "fresh-venv: $venv has an editable install pointing at a path that no longer exists ($stale_pth); recreating"
		rm -rf "$venv"
	fi
done
