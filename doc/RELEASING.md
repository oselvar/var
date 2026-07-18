# Releasing

Releasing is **two steps**, both run on `main` from an interactive shell —
lockstep-versioned across every port:

    make prepare   # bump every port + write CHANGELOG.md, commit & push to main
    make release   # publish every registry, then tag + create the GitHub release

Everything happens on `main` — no release branch, no PR. CI never mutates the
repo: CHANGELOG.md is written once, by `make prepare`.

## Step 1 — `make prepare`

Infers the version from the conventional commits since the last release tag
(`git-cliff --bumped-version`): while on 0.x, a breaking change bumps minor and
everything else bumps patch. Pass `VERSION=x.y.z` only to override — e.g. the
deliberate jump to 1.0.0, which is never inferred.

It then stamps that version into every port's manifests (npm `package.json`,
PyPI `pyproject.toml` + `uv.lock`, Java poms + JVM samples, **Ruby gemspecs +
internal dep pins + `VERSION` constants + `Gemfile.lock`**), regenerates
CHANGELOG.md folding the unreleased commits into the new version's `## [x.y.z]`
section (that section becomes the GitHub release notes), runs `make check`, and
commits `Release vX.Y.Z` to `main` and pushes. It refuses to run if the
changelog section would be empty (no `feat`/`fix`/`perf`/breaking commits since
the last tag). `SKIP_GATE=1` skips `make check`.

Review the diff before it publishes — it is a normal commit on `main`. Preview
the changelog at any time with `make changelog` (stdout only, no file change).

## Step 2 — `make release`

Reads the prepared version from the manifests (no argument), publishes every
registry target, each **skipping what already exists** — and only once every
target is up does it create and push the tag `vX.Y.Z`, then the GitHub release.
Finally it returns Java to a `-SNAPSHOT` placeholder (so a local `mvn install`
doesn't shadow the immutable release in `~/.m2`; Ruby has no such constraint, so
its gems stay stamped at the released version).

Targets run in this order, deliberately: the two that need you at the keyboard
come **first** so you can clear them and walk away, and the slow Maven Central
deploy comes **last**:

1. **npm** — browser 2FA, one round-trip per package.
2. **RubyGems** — one OTP prompt for all six gems (see below).
3. **PyPI**, **Open VSX** — token-based, unattended. (VS Code Marketplace is
   parked; see below.)
4. **Maven Central** — slow (GPG-signed, atomic multi-module deploy); runs
   unattended at the end.
5. **varar-examples** — a quick git sync of `examples/` to the `oselvar/varar-examples`
   repo, pinned to the just-published versions.

Idempotent: if a publish fails, fix the cause and re-run `make release` — it
skips what's already out and picks up where it left off. Because the **tag is
created last**, a failed publish never leaves a dangling tag.
`DRY_RUN=1 release/release.sh` shows the plan without publishing or tagging.

Run `make release` from an interactive shell, not CI: npm keeps 2FA on publishes
(deliberately — no bypass-2FA token), so each npm publish opens a browser
`npmjs.com/auth/cli/...` challenge answered with 1Password/passkey. RubyGems
requires an OTP too (the gemspecs set `rubygems_mfa_required`); the target builds
all pending gems first, then prompts **once** and reuses that code for the whole
batch (`GEM_HOST_OTP_CODE`). If a code expires mid-batch, re-run — published gems
are skipped and you're prompted again for the rest.

A target can be parked with the `DISABLED=1` variable at the top of its
`release/targets/*.sh` (it warns and reports OK). Currently parked:
VS Code Marketplace — **npm, PyPI, Maven Central and Open VSX publish**.

## Credentials

All secrets live in the 1Password vault **`Varar`** (account `my.1password.com`),
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
  `dev.varar` is DNS-verified (2026-07-04) on that account. If it ever needs
  re-verifying, the portal issues a fresh code to publish as a TXT record on
  oselvar.com — a deploy from an account without the verified namespace fails
  with "Namespace 'dev.varar' is not allowed". → `sonatype-central`, fields
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
