# Releasing

One command releases every port, lockstep-versioned:

    make release

The version is inferred from the conventional commits since the last release
tag (`git-cliff --bumped-version`): while on 0.x, a breaking change bumps
minor and everything else bumps patch. Pass `VERSION=x.y.z` only to override
the inference — e.g. the deliberate jump to 1.0.0, which is never inferred.

CHANGELOG.md needs no preparation: it is generated from commit messages
(`make changelog`; CI refreshes `[Unreleased]` on every push to `main`), and
the release folds `[Unreleased]` into the new version's section, which
becomes the GitHub release notes. The script refuses to run if that section
would be empty (no `feat`/`fix`/`perf`/breaking commits since the last tag).

Idempotent: if anything fails, fix the cause and re-run the **same** command.
Already-published artifacts are detected (registry probes) and skipped.
`DRY_RUN=1 release/release.sh` shows the plan without publishing;
`SKIP_GATE=1` skips `make check` when resuming a run that already passed it.

What a release does: preflight checks → `make check` → stamp version into
every manifest + commit → tag `vX.Y.Z` → publish npm, PyPI, Maven Central,
VS Code Marketplace, Open VSX (each skipping what already exists) → push →
GitHub release.

Run releases from an interactive shell, not CI: npm keeps 2FA on publishes
(deliberately — no bypass-2FA token), so each npm publish opens a browser
`npmjs.com/auth/cli/...` challenge answered with 1Password/passkey.

A target can be parked with the `DISABLED=1` variable at the top of its
`release/targets/*.sh` (it warns and reports OK). Currently parked:
VS Code Marketplace — **npm, PyPI, Maven Central and Open VSX publish**.

## Credentials

All secrets live in the 1Password vault **`Vár`** (account `my.1password.com`),
injected via `op run` from the references in `release/release.env` (the vault
is referenced by ID because `op://` URIs reject non-ASCII names). One-time
setup is complete — these notes are for rotating a token or rebuilding a
machine. Never put a real secret in the repo or your shell profile.

Local tools (macOS): `brew install pnpm uv maven gh gnupg 1password-cli jq`
and `npm install -g @vscode/vsce ovsx`. Sign in: `op signin`, `gh auth login`.

- **npm** — granular automation token with publish rights for the `@oselvar`
  scope (npmjs.com → Settings → Access Tokens). → `npm-oselvar`, field `token`.
- **PyPI** — **account-scoped** API token (account `aslakoselvar`). PyPI
  tokens are either account-scoped or single-project — there is no
  multi-project scope, and only an account-scoped token can *create* a
  project, which every release that adds a package needs (all six packages
  live since v0.3.1, 2026-07-06). → `pypi-oselvar`,
  field `token`. Publishing *new* projects is rate-limited per account: a
  `429 Too many new projects created` mid-run is PyPI, not credentials —
  wait (hours) and re-run; published packages are skipped.
- **Sonatype Central Portal (Maven Central)** — user token from
  central.sonatype.com (Account → Generate User Token); namespace
  `com.oselvar` is DNS-verified (2026-07-04) on that account. If it ever needs
  re-verifying, the portal issues a fresh code to publish as a TXT record on
  oselvar.com — a deploy from an account without the verified namespace fails
  with "Namespace 'com.oselvar' is not allowed". → `sonatype-central`, fields
  `username` and `password` (both halves of the generated user token).
- **GPG** — ed25519 signing key for Oselvar Ltd, public key on
  keyserver.ubuntu.com. → `maven-gpg`, field `passphrase`, with an armored
  secret-key export attached as backup.
- **VS Code Marketplace** — Azure DevOps PAT with the **Marketplace →
  Manage** scope, publisher `oselvar`. → `vscode-marketplace`, field `pat`.
- **Open VSX** — access token for the Eclipse Foundation account, namespace
  `oselvar`. → `open-vsx`, field `pat`.

## Adding a new language port (Rust, Go, .NET, ...)

1. Add version stamping for the port's manifest(s) to `release/stamp.sh`.
2. Drop `release/targets/NN-<registry>.sh` following the existing contract:
   probe first (`is <name>@<version> already there?`), publish only what is
   missing, honor `DRY_RUN=1`, exit non-zero only on real failure.
3. Add the registry credential to `release/release.env` and its rotation
   notes here.
