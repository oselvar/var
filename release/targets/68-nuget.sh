#!/usr/bin/env bash
# Pack every Varar .NET package, and publish it to NuGet once that is enabled.
#
# PUBLISHING is PARKED (gated by DOTNET_NUGET_ENABLED in release/lib.sh, which
# keeps pushing here and the 72-varar-examples.sh csharp pin in lock-step).
# While parked this still PACKS every package into release/dist/nuget/<version>
# and prints the paths, so they can be uploaded to nuget.org by hand — packing
# is side-effect-free, and having the artifacts is what a manual upload needs.
# The csharp samples stay out of the examples sync either way: nothing resolves
# from nuget.org until the packages are actually there.
#
# Go-live checklist for automatic publishing:
#   1. Verify the package ids below are free on nuget.org (`Varar`, `Varar.*`),
#      then give each dotnet/*.csproj its packaging metadata — PackageId,
#      Authors, Description, PackageLicenseExpression, RepositoryUrl — and mark
#      the shipping projects packable (the test projects stay IsPackable=false).
#      NOTE: they carry NONE of this today. `dotnet pack` still succeeds, but the
#      nuspec falls back to defaults (assembly name, placeholder description),
#      which is not what you want on a public listing — fix this before the
#      first upload, by hand or otherwise.
#   2. Version the port at release time: the stamper does not touch dotnet/ yet,
#      so wire <Version> stamping (release/stamp.sh) — they carry no version
#      today, defaulting to 1.0.0. (This target passes -p:Version explicitly, so
#      the packed artifacts are correct even before that is wired.)
#   3. Changelog wiring is already in place and gated on this same flag:
#      lint-commits.sh accepts the `dotnet` consumer scope only when
#      DOTNET_NUGET_ENABLED=1, and cliff.toml has a dormant "C# / .NET (NuGet)"
#      section keyed on `dotnet`. So flipping the flag (step 5) also makes
#      feat(dotnet): commits changelog-visible. Until then dotnet work is
#      chore(dotnet): — it ships nothing to a consumer yet.
#   4. Add the NUGET_API_KEY reference to release/release.env.
#   5. Set DOTNET_NUGET_ENABLED=1 in release/lib.sh (un-parks pushing here AND
#      the varar-examples csharp pin together).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

require_tool dotnet
cd "$REPO_ROOT/dotnet"

# The shipping packages, in dependency order (Core first). The two test
# projects (Varar.Core.Tests, Varar.Tests) are IsPackable=false and never ship.
packages=(
  Varar.Core
  Varar.Config
  Varar
  Varar.Runner
  Varar.TestAdapter
)

# Persistent (release/dist is gitignored, same place the .vsix is built) so the
# packages survive the run and can be uploaded by hand.
pack_dir="$REPO_ROOT/release/dist/nuget/$VERSION"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  for name in "${packages[@]}"; do
    if [[ "$DOTNET_NUGET_ENABLED" == "1" ]]; then
      log "nuget: would pack + push $name $VERSION"
    else
      log "nuget: would pack $name $VERSION to $pack_dir (publishing parked)"
    fi
  done
  exit 0
fi

mkdir -p "$pack_dir"
for name in "${packages[@]}"; do
  dotnet pack "$name/$name.csproj" -c Release -p:Version="$VERSION" -o "$pack_dir" >/dev/null
done

if [[ "$DOTNET_NUGET_ENABLED" != "1" ]]; then
  warn "nuget: publishing parked (DOTNET_NUGET_ENABLED=0) — packed for manual upload to https://www.nuget.org/packages/manage/upload"
  for name in "${packages[@]}"; do
    log "nuget:   $pack_dir/$name.$VERSION.nupkg"
  done
  exit 0
fi

for name in "${packages[@]}"; do
  # nuget.org de-dupes by (id, version): a re-push of an existing version is a
  # 409, so --skip-duplicate makes the whole target idempotent on rerun.
  dotnet nuget push "$pack_dir/$name.$VERSION.nupkg" \
    --source https://api.nuget.org/v3/index.json \
    --api-key "$NUGET_API_KEY" \
    --skip-duplicate
  log "nuget: published $name $VERSION"
done
log "nuget: done"
