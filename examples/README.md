# Vár examples

Small, standalone sample projects that run Markdown specs as tests with
[Vár](https://var.oselvar.com) — one project per language/test-framework
combination. Each is a complete project you can copy as the starting point
for your own.

The `.md` files at each project's root are the specs — plain Markdown prose
that runs as tests. They are first-class: readable by anyone, owned by the
whole team, and checked against the code on every test run.

| Project | Stack | Run with | CI |
| --- | --- | --- | --- |
| [`typescript-vitest`](typescript-vitest) | TypeScript + vitest | `pnpm test` | [![typescript-vitest](https://github.com/oselvar/var-examples/actions/workflows/typescript-vitest.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/typescript-vitest.yml) |
| [`kotlin-junit`](kotlin-junit) | Kotlin + JUnit + Gradle | `./gradlew test` | [![kotlin-junit](https://github.com/oselvar/var-examples/actions/workflows/kotlin-junit.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/kotlin-junit.yml) |
| [`kotlin-kotest`](kotlin-kotest) | Kotlin + Kotest + Gradle | `./gradlew test` | [![kotlin-kotest](https://github.com/oselvar/var-examples/actions/workflows/kotlin-kotest.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/kotlin-kotest.yml) |
| [`java-junit-maven`](java-junit-maven) | Java + JUnit + Maven | `mvn test` | [![java-junit-maven](https://github.com/oselvar/var-examples/actions/workflows/java-junit-maven.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/java-junit-maven.yml) |
| [`java-junit-gradle`](java-junit-gradle) | Java + JUnit + Gradle | `./gradlew test` | [![java-junit-gradle](https://github.com/oselvar/var-examples/actions/workflows/java-junit-gradle.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/java-junit-gradle.yml) |
| [`python-pytest`](python-pytest) | Python + pytest | `uv run pytest` | [![python-pytest](https://github.com/oselvar/var-examples/actions/workflows/python-pytest.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/python-pytest.yml) |
| [`python-unittest`](python-unittest) | Python + unittest | `uv run python -m unittest` | [![python-unittest](https://github.com/oselvar/var-examples/actions/workflows/python-unittest.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/python-unittest.yml) |
| [`ruby-rspec`](ruby-rspec) | Ruby + RSpec | `bundle exec rspec` | [![ruby-rspec](https://github.com/oselvar/var-examples/actions/workflows/ruby-rspec.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/ruby-rspec.yml) |
| [`ruby-minitest`](ruby-minitest) | Ruby + Minitest | `bundle exec rake test` | [![ruby-minitest](https://github.com/oselvar/var-examples/actions/workflows/ruby-minitest.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/ruby-minitest.yml) |
| [`rust-cargotest`](rust-cargotest) | Rust + cargo test | `cargo test` | [![rust-cargotest](https://github.com/oselvar/var-examples/actions/workflows/rust-cargotest.yml/badge.svg)](https://github.com/oselvar/var-examples/actions/workflows/rust-cargotest.yml) |

`typescript-vitest` implements the full example set; the other projects
implement a feature-covering subset — `hello-var` (basic steps),
`deep-thought` (a one-sensor spec), `tables-and-docstrings` (whole tables +
doc strings), `yahtzee` and `roman-numerals` (header-bound table rows), and
`library` (custom parameter types that pair `parse` with `format`, so a
mismatch renders in the document's own notation — money, dates, and an
emphasised title where the markup *is* the parameter).

## Where these files live

The source of truth is the [`oselvar/var`](https://github.com/oselvar/var)
monorepo's `examples/` directory, where the projects run against the local
build on every push (in there, the subset projects' `.md` files are symlinks
to the `typescript-vitest` originals). On every release they are synced —
symlinks resolved, versions pinned to the release — to
[`oselvar/var-examples`](https://github.com/oselvar/var-examples). Send
changes to `oselvar/var`.
