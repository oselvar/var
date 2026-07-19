#!/usr/bin/env bash
#
# Convert a Go coverage profile (`go test -coverprofile`) on stdin to an lcov
# report on stdout — just enough (SF / LF / LH per file) for
# scripts/coverage-summary.sh's lcov_totals, which reads only LF:/LH:. Go has no
# native branch coverage, so no BRF/BRH lines are emitted (branches render n/a).
#
#   go test -coverprofile=cover.out ./...
#   scripts/gocover-to-lcov.sh < cover.out > coverage/lcov.info
#
set -euo pipefail

awk '
  NR == 1 && /^mode:/ { next }
  {
    # A record is: <import-path>/file.go:sL.sC,eL.eC <numStmts> <count>
    count = $NF
    loc   = $1
    ci = match(loc, /:[0-9]+\.[0-9]+,[0-9]+\.[0-9]+$/)
    if (ci == 0) next
    file = substr(loc, 1, ci - 1)
    rng  = substr(loc, ci + 1)
    split(rng, r, ",")
    split(r[1], s, ".")
    split(r[2], e, ".")
    for (ln = s[1]; ln <= e[1]; ln++) {
      key = file SUBSEP ln
      if (!(key in seen) || count + 0 > seen[key]) seen[key] = count + 0
      files[file] = 1
    }
  }
  END {
    for (key in seen) {
      split(key, kv, SUBSEP)
      f = kv[1]
      lf[f]++
      if (seen[key] > 0) lh[f]++
    }
    for (f in files) {
      print "SF:" f
      print "LF:" (lf[f] + 0)
      print "LH:" (lh[f] + 0)
      print "end_of_record"
    }
  }
'
