# Build and test every language port from the repo root.
#
#   make            # same as `make check`: all three ports
#   make typescript # pnpm build + pnpm check (lint, typecheck, test, knip, jscpd)
#   make python     # pytest + ruff
#   make java       # mvn verify (JDK 21, pinned in java/.tool-versions)
#
# Each target runs the same gate as that port's CI workflow in .github/workflows/.

.PHONY: check commits typescript python java changelog release

check: commits typescript python java

# Commits since the last release tag must be conventional (they drive the
# changelog and the version bump — see cliff.toml and CLAUDE.md).
commits:
	release/lint-commits.sh

typescript:
	cd typescript && pnpm install && pnpm build && pnpm check

python:
	cd python && uv sync && uv run pytest && uv run ruff check

java:
	cd java && mvn --batch-mode verify

# Regenerate CHANGELOG.md from conventional commits (releases + Unreleased).
changelog:
	release/changelog.sh

# Release every port (idempotent; re-run the same command on failure).
# The version is inferred from conventional commits; pass VERSION=x.y.z only
# to override (e.g. the deliberate 1.0.0).
#   make release
release:
	release/release.sh $(VERSION)
