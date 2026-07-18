#!/usr/bin/env bash
#
# Distil each port's native coverage report into a small, uniform JSON summary
# (repo-root coverage.json) and refresh the coverage table in README.md.
#
# Run after `make coverage` (which produces every port's native report). Reads
# only what the native tools already emit — no extra reporters or dependencies:
#
#   TypeScript  typescript/coverage/lcov.info      (vitest v8 → lcov)
#   Python      python/coverage.lcov               (coverage.py → lcov)
#   Ruby        ruby/coverage/lcov.info            (SimpleCov → lcov)
#   Java+Kotlin java/*/target/site/jacoco/jacoco.csv  (JaCoCo, all JVM modules
#                                                       summed into one figure)
#
# lcov gives LF/LH (lines found/hit) and BRF/BRH (branches); JaCoCo's CSV gives
# per-class LINE_/BRANCH_ MISSED+COVERED columns we sum. A missing report yields
# a null entry (rendered "n/a") rather than a failure, so the script is safe to
# run before a port has been measured.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

JSON_OUT="$ROOT/coverage.json"
README="$ROOT/README.md"

# --- helpers -----------------------------------------------------------------

# pct <covered> <total> -> percentage with one decimal, or "null" when total==0.
pct() {
  awk -v c="$1" -v t="$2" 'BEGIN { if (t+0==0) print "null"; else printf "%.1f", c*100/t }'
}

# lcov_totals <file> -> "linesCovered linesTotal branchesCovered branchesTotal",
# or empty when the file is absent.
lcov_totals() {
  [ -f "$1" ] || return 0
  awk -F: '
    /^LF:/  { lf  += $2 }
    /^LH:/  { lh  += $2 }
    /^BRF:/ { brf += $2 }
    /^BRH:/ { brh += $2 }
    END     { print lh+0, lf+0, brh+0, brf+0 }
  ' "$1"
}

# jacoco_totals <csv...> -> same 4-tuple, summed across every JaCoCo CSV given.
jacoco_totals() {
  local found=0 f
  for f in "$@"; do [ -f "$f" ] && found=1; done
  [ "$found" -eq 1 ] || return 0
  # CSV columns: 6 BRANCH_MISSED, 7 BRANCH_COVERED, 8 LINE_MISSED, 9 LINE_COVERED
  awk -F, '
    FNR > 1 { lc += $9; lt += $8 + $9; bc += $7; bt += $6 + $7 }
    END     { print lc+0, lt+0, bc+0, bt+0 }
  ' "$@" 2>/dev/null
}

# port_json <id> <label> <totals> -> one JSON object (or a null-metrics object).
port_json() {
  local id="$1" label="$2" totals="$3"
  if [ -z "$totals" ]; then
    jq -nc --arg id "$id" --arg name "$label" \
      '{"port":$id, "label":$name, "lines":null, "branches":null}'
    return
  fi
  # shellcheck disable=SC2086
  set -- $totals
  local lc="$1" lt="$2" bc="$3" bt="$4"
  jq -nc \
    --arg id "$id" --arg name "$label" \
    --argjson lc "$lc" --argjson lt "$lt" --arg lp "$(pct "$lc" "$lt")" \
    --argjson bc "$bc" --argjson bt "$bt" --arg bp "$(pct "$bc" "$bt")" \
    '{
      "port": $id, "label": $name,
      "lines":    {"covered":$lc, "total":$lt, "pct":($lp|if .=="null" then null else tonumber end)},
      "branches": {"covered":$bc, "total":$bt, "pct":($bp|if .=="null" then null else tonumber end)}
    }'
}

# --- collect -----------------------------------------------------------------

TS_JSON=$(port_json ts     "TypeScript"        "$(lcov_totals typescript/coverage/lcov.info)")
JVM_JSON=$(port_json jvm   "Java / Kotlin"     "$(jacoco_totals java/*/target/site/jacoco/jacoco.csv)")
PY_JSON=$(port_json python "Python"            "$(lcov_totals python/coverage.lcov)")
RB_JSON=$(port_json ruby   "Ruby"              "$(lcov_totals ruby/coverage/lcov.info)")
# Rust has no coverage report yet (make coverage doesn't measure it), so this
# reads a not-yet-existent lcov and renders n/a — the row is still emitted so
# the port carries its build badge. Wire rust coverage here the day it lands.
RUST_JSON=$(port_json rust "Rust"              "$(lcov_totals rust/coverage/lcov.info)")

jq -n --slurpfile a <(printf '%s\n%s\n%s\n%s\n%s\n' "$TS_JSON" "$JVM_JSON" "$PY_JSON" "$RB_JSON" "$RUST_JSON") \
  '$a' > "$JSON_OUT"

echo "Wrote $JSON_OUT"

# --- render README table -----------------------------------------------------

# shields.io colour buckets by line-coverage percentage.
colour() {
  awk -v p="$1" 'BEGIN {
    if (p=="null")      { print "lightgrey" }
    else if (p+0>=90)   { print "brightgreen" }
    else if (p+0>=80)   { print "green" }
    else if (p+0>=70)   { print "yellowgreen" }
    else if (p+0>=60)   { print "yellow" }
    else if (p+0>=50)   { print "orange" }
    else                { print "red" }
  }'
}

# badge <pct> -> a shields.io static-badge markdown image (or an "n/a" badge).
badge() {
  local p="$1"
  if [ "$p" = "null" ]; then
    printf '![n/a](https://img.shields.io/badge/coverage-n%%2Fa-lightgrey)'
  else
    printf '![%s%%](https://img.shields.io/badge/coverage-%s%%25-%s)' "$p" "$p" "$(colour "$p")"
  fi
}

# build_badge <port-id> -> a live GitHub Actions status badge for that port's
# CI workflow (auto-updates from the Actions API; no regeneration needed). Maps
# the coverage port id to its workflow file in .github/workflows/.
build_badge() {
  local wf
  case "$1" in
    ts)     wf=typescript ;;
    jvm)    wf=java ;;
    python) wf=python ;;
    ruby)   wf=ruby ;;
    rust)   wf=rust ;;
    *)      wf="$1" ;;
  esac
  printf '[![Build](https://github.com/oselvar/var/actions/workflows/%s.yml/badge.svg?branch=main)](https://github.com/oselvar/var/actions/workflows/%s.yml)' "$wf" "$wf"
}

TABLE=$(mktemp)
{
  echo '| Port | Build | Line coverage | Branch coverage |'
  echo '| --- | --- | --- | --- |'
  jq -r '.[] | [.port, .label,
                (.lines.pct    // "null" | tostring),
                (.branches.pct // "null" | tostring)] | @tsv' "$JSON_OUT" \
  | while IFS=$'\t' read -r _id label lpct bpct; do
      echo "| $label | $(build_badge "$_id") | $(badge "$lpct") | $(badge "$bpct") |"
    done
} > "$TABLE"

# Splice the table between the markers, leaving the rest of the README intact.
START='<!-- coverage:start -->'
END='<!-- coverage:end -->'
if grep -qF "$START" "$README" && grep -qF "$END" "$README"; then
  awk -v start="$START" -v end="$END" -v tablefile="$TABLE" '
    $0 ~ start { print; while ((getline line < tablefile) > 0) print line; skip=1; next }
    $0 ~ end   { skip=0 }
    !skip      { print }
  ' "$README" > "$README.tmp" && mv "$README.tmp" "$README"
  echo "Updated coverage table in $README"
else
  echo "WARNING: coverage markers not found in $README; table not updated" >&2
fi
rm -f "$TABLE"
