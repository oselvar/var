# Build and test every language port from the repo root.
#
#   make            # same as `make check`: all three ports
#   make typescript # pnpm build + pnpm check (lint, typecheck, test, knip, jscpd)
#   make python     # pytest + ruff + no-reexports gate
#   make java       # mvn verify (JDK 21, pinned in java/.tool-versions)
#   make coverage   # test with coverage in all three ports (reports below)
#
# Each target runs the same gate as that port's CI workflow in .github/workflows/.

.PHONY: check commits typescript python java coverage changelog release

check: commits typescript python java

# Commits since the last release tag must be conventional (they drive the
# changelog and the version bump — see cliff.toml and CLAUDE.md).
commits:
	release/lint-commits.sh

typescript:
	cd typescript && pnpm install && pnpm build && pnpm check

python:
	cd python && uv sync && uv run pytest && uv run ruff check && uv run python scripts/lint_no_reexports.py

java:
	cd java && mvn --batch-mode verify

# Coverage reports: typescript/coverage/index.html, python/htmlcov/index.html,
# java/<module>/target/site/jacoco/index.html (jacoco runs on every verify).
# lcov files (typescript/coverage/lcov.info, python/coverage.lcov) feed
# editor gutters and CI integrations.
coverage:
	cd typescript && pnpm install && pnpm test:coverage
	cd python && uv sync && uv run pytest --cov --cov-report=term --cov-report=html --cov-report=lcov
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
