# Go runner + config + `go test` adapter (sub-project 2 of the Go port)

Date: 2026-07-19
Status: design, implemented

The imperative shell of the Go port, on the conformance-green `varcore`
([core design](2026-07-19-go-core-port-design.md), [ADR 0010](../../adr/0010-go-port.md)).
Scope: the `varconfig` reader, the `varrunner` shell, and the `vargotest`
adapter ([ADR 0011](../../adr/0011-go-test-integration.md)). Rust's runner +
`var-cargotest` is the closest precedent; Go simplifies it (native `t.Run`
subtests, no `Send`/thread constraints).

## `varconfig`

A strict, fail-loud reader of the canonical `{ docs: {include, exclude}, steps,
snippets, scannerPlugins }` shape. Missing file → empty config; unknown keys /
wrong types / invalid JSON → an error beginning with the file path. Pure
(`encoding/json` only; the conformance test uses `varcore`'s canonical JSON to
project + compare). **Done = reproduces `conformance/config/cases/*` (8 cases)
byte-for-byte** or raises.

## `varrunner`

- `GlobToRegex` — the shared glob→regex semantics (`/**/`, `/**`, `**/`, `**`,
  `*`, `?`) matching the other runners byte-for-byte — `FindSpecs`/`MatchSpec`
  over a recursive file walk with include/exclude.
- `PlanSpec` (parse + plan), `ExampleNames` (innermost heading, de-duplicated
  with a `[n]` suffix so header-bound rows share their binding sentence's name),
  `RunExample` (run one example by index via the core's `CollectExamples`).
- `RenderFailure` — reuses the core diff payloads, anchored to the `.md`.
- `FileBaselineStore` — the filesystem `varar.lock.json` read/write implementing
  the core `BaselineStore` port.

Steps are supplied by the caller (Go compiles step files in; there is no dynamic
`load_steps`) as a `Registry` plus a context factory. Unit tests translate the
shared runner suite (glob segmenting, include/exclude discovery, baseline
round-trip).

## `vargotest` adapter (ADR 0011)

`Run(t, root, buildRegistry, context)` discovers specs, plans each, and emits one
`t.Run` subtest per example (named `<rel>::<display>`), reporting the core's
rendered failure via `t.Error`. Drift is reconciled per spec against
`varar.lock.json`; each drifted paragraph becomes a failing subtest, and
`VAR_UPDATE=1`/`true` accepts drift instead. The enumeration is factored into a
pure `Collect(...) ([]Case, error)` so it is unit-testable without a `*testing.T`;
a per-adapter drift test covers the passing, drift-reported, and
update-accepts-drift paths.

## Out of scope (v1)

Snippet/step-def generation; a `var` CLI (`var init`); full per-example fixture
teardown (Go `testing` has no fixture DI to bridge). The tree-sitter dialect and
the repo/release integration (Makefile, coverage, CI, `languages.json`, website
tabs, module publishing, `cliff`/`lint-commits` scope) are tracked in the
[port plan](../plans/2026-07-19-go-port.md).
