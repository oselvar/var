# Vár sample: Go + go test

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://varar.dev), driven by `go test`. Copy it as the starting point for
your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
go test                          # one subtest per example, all green
go test -v                       # lists every example (30 total)
go test -run 'TestSpecs/yahtzee' # run a single spec
VAR_UPDATE=1 go test             # accept drift (rewrites varar.lock.json)
```

Each Markdown example becomes one Go subtest, named `spec.md::name`, reported by
`go test` like any native subtest (`go test -run`, `-v`, exit codes) — see
[ADR 0011](https://github.com/varar-dev/varar/blob/main/doc/adr/0011-go-test-integration.md).

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs the
  Markdown specs. (`steps` is carried for parity with the other ports; Go compiles
  its step files in, so there is nothing to glob at runtime.)
- **`steps_*.go`** define the steps. Go has no import-for-side-effect, so — like
  the Rust/Java/Kotlin/C# ports and unlike TypeScript/Python — each file exposes a
  `register(*varar.Steps)` that adds its steps to an injected builder, and
  `BuildRegistry` threads one builder through them all. State is a
  **full-replacement** `Value` (a stimulus returns the whole next state).
- **`yahtzee.go` / `roman.go` / `library_domain.go`** are the domain code under
  test.
- **`specs_test.go`** wires it into `go test` via `vargotest.Run` — one subtest
  per Markdown example. Discovery, planning, running, rendering, and drift all
  live in the shared `varar-go` packages, so the sample carries no runner of its
  own.
- **`varar.lock.json`** is the committed drift baseline: if a paragraph that was
  an example stops matching any step, the run fails until you fix the step or
  accept the drift with `VAR_UPDATE=1`.
