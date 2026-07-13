# Build and test every language port from the repo root.
#
#   make            # same as `make check`: every port
#   make typescript # pnpm build + pnpm check (lint, typecheck, test, knip, jscpd)
#   make python     # pytest + ruff + no-reexports gate + examples/python-pytest
#   make java       # spotless:apply (formats Java + Kotlin, incl. the JVM sample
#                   # projects in examples/) + mvn install (JDK 21, pinned in
#                   # java/.tool-versions) + the four JVM sample projects in
#                   # examples/ (Maven/Gradle, Java/Kotlin)
#   make ruby       # bundle + rake (rubocop + rspec + purity gate) +
#                   # examples/ruby-rspec and examples/ruby-minitest (Ruby 3.2,
#                   # pinned in ruby/.tool-versions)
#   make rust       # cargo fmt/clippy/test (var-core) + examples/rust-cargotest
#   make coverage   # test with coverage in all four ports (reports below)
#
# Each target runs the same gate as that port's CI workflow in .github/workflows/.

.PHONY: check commits typescript python java ruby rust coverage changelog prepare release

check: commits typescript python java ruby rust

# Commits since the last release tag must be conventional (they drive the
# changelog and the version bump — see cliff.toml and CLAUDE.md).
commits:
	release/lint-commits.sh

typescript:
	cd typescript && pnpm install && pnpm build && pnpm check

python:
	# Drop any .venv left pointing at an old checkout path (e.g. after a repo
	# rename); uv won't repair a relocated venv on its own. See fresh-venv.sh.
	scripts/fresh-venv.sh python examples/python-pytest examples/python-unittest
	cd python && uv sync && uv run pytest --cov && uv run ruff check && uv run python scripts/lint_no_reexports.py
	cd examples/python-pytest && uv run pytest
	cd examples/python-unittest && uv run python -m unittest

# spotless:apply first, so a local run prettifies instead of failing the bound
# spotless:check (CI runs plain `mvn install`, where drift fails the build).
java:
	cd java && mvn --batch-mode spotless:apply install
	cd examples/java-junit-maven && mvn --batch-mode test
	cd examples/java-junit-gradle && ./gradlew --console=plain test
	cd examples/kotlin-junit && ./gradlew --console=plain test
	cd examples/kotlin-kotest && ./gradlew --console=plain test

ruby:
	cd ruby && bundle install && bundle exec rake
	cd examples/ruby-rspec && bundle install && bundle exec rspec
	cd examples/ruby-minitest && bundle install && bundle exec rake test

# Rust port: pure cargo (var-core), then the standalone sample project (which
# depends on var-core by path and runs the Markdown specs via `cargo test`).
rust:
	cd rust && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
	cd examples/rust-cargotest && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test

# Coverage reports: typescript/coverage/index.html, python/htmlcov/index.html,
# java/<module>/target/site/jacoco/index.html (jacoco runs on every verify),
# ruby/coverage/index.html. lcov files (typescript/coverage/lcov.info,
# python/coverage.lcov, ruby/coverage/lcov.info) feed editor gutters and CI
# integrations. scripts/coverage-summary.sh then distils all five ports into the
# tracked coverage.json and refreshes the coverage table in README.md.
coverage:
	cd typescript && pnpm install && pnpm test:coverage
	cd python && uv sync && uv run pytest --cov --cov-report=term --cov-report=html --cov-report=lcov
	cd java && mvn --batch-mode verify
	cd ruby && bundle install && COVERAGE=1 bundle exec rake spec
	scripts/coverage-summary.sh

# Preview the changelog that the next release would add (stdout only — the
# tracked CHANGELOG.md is written only at release time, by `make prepare`).
changelog:
	release/changelog.sh --preview

# Releasing is two steps, both on main (see doc/RELEASING.md):
#
#   make prepare   # bump every port + write CHANGELOG.md, commit & push to main
#   make release   # publish every registry, then tag + create the GitHub release
#
# prepare infers the version from conventional commits; pass VERSION=x.y.z only
# to override (e.g. the deliberate 1.0.0). release reads the prepared version
# from the manifests — no argument. Both are idempotent; re-run on failure.
prepare:
	release/prepare.sh $(VERSION)

release:
	release/release.sh
