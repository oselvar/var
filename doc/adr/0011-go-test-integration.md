# ADR 0011 — Go `go test` integration via subtests

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** Aslak Hellesøy
- **Tags:** go, go-test, test-runner-adapter, cross-language

## Context

Go is a full pipeline port ([ADR 0010](0010-go-port.md)). Like every other port,
its test-framework adapter must give **one independently selectable/reportable
test per Markdown example**, with failures rendered anchored to the `.md` source,
and a **drift gate** ([ADR 0002](0002-drift-detection-and-acknowledgment.md)).
The "framework" in Go is `go test` over the built-in `testing` package.

Unlike Rust's `cargo test` (whose `#[test]` set is fixed at compile time — the
whole obstacle ADR 0007 works around with `libtest-mimic`), Go's `testing`
package has a **native runtime sub-test mechanism**: `t.Run(name, func(t
*testing.T))` registers a subtest during test execution, from data known only at
runtime. And var's core is single-goroutine-friendly with no `Send`/`Sync`
constraints to satisfy — a planned example can be captured directly by a subtest
closure. So the Rust `Send`/thread-local re-derivation dance is unnecessary here.

### Options considered

**A. `go generate` code generation.** Parse every spec at generate time and emit
one `func TestX(t *testing.T)` per example. Gives real top-level tests, but adds a
generate step that must be re-run on every spec edit and duplicates the parse.
Rejected — the `t.Run` mechanism makes it unnecessary.

**B. A single entry-point test that fans out with `t.Run` (chosen).** The
consumer writes one ordinary `func TestSpecs(t *testing.T)` that calls
`vargotest.Run(t, root, buildRegistry, context)`. The adapter discovers specs via
`varar.config.json`, plans each, and calls `t.Run` once per example (and once per
drift finding). `go test -run 'TestSpecs/spec.md::Example'` selects a single
example; `go test -v` lists them; failures are reported with `t.Error` carrying
the core's rendered, `.md`-anchored diff. This is the idiomatic Go table-driven
pattern applied to data discovered at runtime.

## Decision

**Adopt option B: one `t.Run` subtest per Markdown example**, driven by
`vargotest.Run`. The enumeration logic is factored into a pure, `*testing.T`-free
`Collect(root, buildRegistry, context, update) ([]Case, error)` so it is
unit-testable; `Run` is the thin `testing` wrapper over it.

- **Collection:** one `Case` per example, named `"<rel-md-path>::<example
  name>"`, with header-bound rows sharing their binding sentence's de-duplicated
  display name (the shared `ExampleNames` rule).
- **Discovery/config:** the shared `varar.config.json` (`varconfig`), same keys as
  every port.
- **Failure rendering:** reuses the core diff payloads via the runner's
  `RenderFailure`, anchored to the `.md`.
- **Drift gate:** each spec is reconciled against `varar.lock.json` via the
  filesystem `BaselineStore`; a clean run rewrites the baseline, each drifted
  paragraph becomes a failing subtest, and `VAR_UPDATE=1` (or `true`) accepts
  drift instead of failing (ADR 0002 — never silently accept). A per-adapter
  drift test covers the passing, drift-reported, and update-accepts paths.
- **Fixtures/DI:** Go's `testing` has no fixture-injection mechanism to bridge, so
  handlers keep the core `(state, args)` signature unchanged; there is no
  trailing-parameter classification to do.

## Consequences

- Consumers get native `go test` selection, listing, filtering, verbose output,
  and exit codes for free — no custom harness.
- The adapter contains no pipeline logic; it composes `varrunner` + `varcore`.
- No compile-time code generation and no build step: adding or editing a spec
  changes the subtest set on the next `go test` run with nothing to regenerate.
