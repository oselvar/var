# Releasing

One command releases every port, lockstep-versioned:

    make release VERSION=0.1.0

Idempotent: if anything fails, fix the cause and re-run the **same** command.
Already-published artifacts are detected (registry probes) and skipped.
`DRY_RUN=1 release/release.sh 0.1.0` shows the plan without publishing;
`SKIP_GATE=1` skips `make check` when resuming a run that already passed it.

Before releasing: rename `## [Unreleased]` in `CHANGELOG.md` to
`## [x.y.z]` and commit. The release script refuses to run without that
section — it becomes the GitHub release notes.

What a release does: preflight checks → `make check` → stamp version into
every manifest + commit → tag `vX.Y.Z` → publish npm, PyPI, Maven Central,
VS Code Marketplace, Open VSX (each skipping what already exists) → push →
GitHub release.

## One-time setup

All secrets live in the 1Password vault **`Vár`** (account `my.1password.com`),
injected via `op run` with the references in `release/release.env`. The env file
references the vault by ID because `op://` URIs reject non-ASCII vault names.
The seven items already exist with `PLACEHOLDER-set-me` values — the setup steps
below replace those values with real tokens. Never put a real secret in the
repo or your shell profile.

Local tools (macOS): `brew install pnpm uv maven gh gnupg 1password-cli jq`
and `npm install -g @vscode/vsce ovsx`. Sign in: `op signin`, `gh auth login`.

### 1. npm (`@oselvar` scope — exists)
Create a granular automation token with publish rights for the `@oselvar`
scope and the `oselvar-var`-adjacent public packages at
https://www.npmjs.com/settings → Access Tokens.
→ 1Password item `npm-oselvar`, field `token`.

### 2. PyPI
Create an account (enable 2FA) at https://pypi.org. Create an API token
(account-scoped for the first release; after the packages exist, replace it
with a project-scoped token covering oselvar-var, oselvar-var-core,
oselvar-var-runner, pytest-var, oselvar-var-unittest).
→ item `pypi-oselvar`, field `token` (the full `pypi-...` value).

### 3. Sonatype Central Portal (Maven Central)
1. Account at https://central.sonatype.com.
2. Register namespace `com.oselvar`; verify via the DNS TXT record it gives
   you on `oselvar.com`.
3. Generate a publishing token (Account → Generate User Token).
→ item `sonatype-central`, fields `username` and `token`.

### 4. GPG signing key
    gpg --quick-generate-key "Oselvar Ltd <aslak@oselvar.com>" ed25519 sign never
    gpg --keyserver keyserver.ubuntu.com --send-keys <KEYID>
→ item `maven-gpg`, field `passphrase`; attach an export
(`gpg --export-secret-keys --armor <KEYID>`) as a document for backup.

### 5. VS Code Marketplace
Publisher `oselvar` at https://marketplace.visualstudio.com/manage. Create an
Azure DevOps PAT with the **Marketplace → Manage** scope.
→ item `vscode-marketplace`, field `pat`.

### 6. Open VSX
Eclipse Foundation account at https://open-vsx.org, sign the publisher
agreement, create the namespace (`ovsx create-namespace oselvar -p <token>`),
generate an access token.
→ item `open-vsx`, field `pat`.

## Adding a new language port (Rust, Go, .NET, ...)

1. Add version stamping for the port's manifest(s) to `release/stamp.sh`.
2. Drop `release/targets/NN-<registry>.sh` following the existing contract:
   probe first (`is <name>@<version> already there?`), publish only what is
   missing, honor `DRY_RUN=1`, exit non-zero only on real failure.
3. Add the registry credential to `release/release.env` (`op://<vault-id>/...` (see `release/release.env`))
   and its setup here.
