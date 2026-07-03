#!/usr/bin/env bash
# Every commit since the last release tag must be a conventional commit,
# because CHANGELOG.md and the next version are GENERATED from commit
# messages (cliff.toml). See "Commit messages & changelog" in CLAUDE.md.
#
#   release/lint-commits.sh            # lint <last release tag>..HEAD
#   release/lint-commits.sh <range>    # lint an explicit range
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

RANGE="${1:-}"
if [[ -z "$RANGE" ]]; then
  latest="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
  RANGE="${latest:+$latest..}HEAD"
fi

TYPES='feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert'
CC_RE="^($TYPES)(\\(([^)]+)\\))?(!)?: .+$"
# feat/fix/perf and breaking commits become changelog entries; their scope
# decides which consumer section the entry lands in, so it must be one of
# these (optionally `/package`, e.g. ts/var-vitest). Work that ships nothing
# to a consumer (website, CI, tooling) is a chore/docs/build commit instead.
CONSUMER_SCOPE='^(ts|py|java|vscode|spec)(/[a-z0-9._-]+)?$'

# Commits from between v0.1.0 and the adoption of this convention.
EXEMPT=(
  ff15b430dd3aad211e40f456407561ddd8066fae # Retire old website
  812cf1a8e2b16e9fcf07ea26e1c9b62bbff73e32 # Update lockfile
  970798caee2f4e3d85ff73dd0adc37ad6560e83f # Upgrade, edit links
)

fail=0
complain() { warn "$1  ($2: $3)"; fail=1; }

while IFS=$'\t' read -r sha subject; do
  [[ " ${EXEMPT[*]} " == *" $sha "* ]] && continue
  short="${sha:0:7}"
  # Release stamp commits are created by release.sh, not authored.
  [[ "$subject" =~ ^Release\ v[0-9] ]] && continue
  if [[ ! "$subject" =~ $CC_RE ]]; then
    complain "not a conventional commit (see CLAUDE.md)" "$short" "$subject"
    continue
  fi
  type="${BASH_REMATCH[1]}" scope="${BASH_REMATCH[3]}" bang="${BASH_REMATCH[4]}"
  breaking="$bang"
  [[ -z "$breaking" ]] && git log -1 --format=%b "$sha" | grep -q '^BREAKING[- ]CHANGE:' && breaking=1
  if [[ "$type" =~ ^(feat|fix|perf)$ || -n "$breaking" ]]; then
    [[ "$scope" =~ $CONSUMER_SCOPE ]] ||
      complain "changelog-visible commit needs a consumer scope (ts|py|java|vscode|spec, e.g. ts/var-vitest) — or use chore:/docs: if nothing shipped changes" "$short" "$subject"
  fi
done < <(git log --no-merges --format=$'%H\t%s' "$RANGE")

[[ "$fail" == "0" ]] || die "commit lint failed for $RANGE"
log "commit lint OK ($RANGE)"
