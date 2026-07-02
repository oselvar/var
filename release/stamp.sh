#!/usr/bin/env bash
# Stamp <version> into every manifest of every port. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

VERSION="${1:-}"
[[ -n "$VERSION" ]] || die "usage: release/stamp.sh <version>"
is_semver "$VERSION" || die "not a semver version: $VERSION"

log "stamping TypeScript packages"
node -e '
const fs = require("node:fs"), path = require("node:path");
const version = process.argv[1];
for (const dir of fs.readdirSync("typescript/packages")) {
  const file = path.join("typescript/packages", dir, "package.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (pkg.version === version) continue;
  pkg.version = version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
' "$VERSION"

log "stamping Python packages (+ pinning internal deps)"
python3 release/stamp_python.py "$VERSION"
(cd python && uv lock --quiet)

log "stamping Java modules"
(cd java && mvn --batch-mode --quiet versions:set -DnewVersion="$VERSION" -DgenerateBackupPoms=false)

log "stamped $VERSION"
