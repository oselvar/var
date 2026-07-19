# Go core port — pure runtime core + facade (sub-project 1 of the Go port)

Date: 2026-07-19
Status: design, implemented (conformance-green)

First sub-project of the Go port ([ADR 0010](../../adr/0010-go-port.md)). Scope
is the **pure Go runtime core** (`varcore`) plus the **author facade**
(`varar`). The runner and `go test` adapter are sub-project 2
([go-runner-adapter-design](2026-07-19-go-runner-adapter-design.md)).

Go shares no runtime with any existing port, so this is a **full pipeline port**
against the TypeScript reference, gated on all four shared conformance artifacts.
Rust and C# are the closest precedents (static language, explicit `Value` model,
injected registrar, full-replacement state, byte-indexed strings needing a
UTF-16 conversion layer) — this port translates the algorithms, it does not
redesign them.

## Package shape

A single Go module `github.com/varar-dev/varar-go` rooted at `go/`, with one
package per port concern (Go's package boundary enforces the hexagonal seam; the
purity gate is `grep` that `core/` imports neither `varar` nor `runner`):

| Dir | Package | Owns |
|---|---|---|
| `core/` | `varcore` | the pure pipeline + diffs + drift + canonical JSON + conformance projections |
| `varar/` | `varar` | the author API (`Steps` builder, `Value`, handler returns) |
| `config/` | `varconfig` | the `varar.config.json` reader (own conformance corpus) |
| `runner/` | `varrunner` | discovery, plan/run, render, filesystem `BaselineStore` |
| `gotest/` | `vargotest` | the `go test` adapter |

## Module map (`varar-core` / rust `varar-core` → `go/core`)

Ported 1:1, names kept parallel (Go idiom): `offsets`, `span`, `value`,
`canonical_json`, `ast`, `table_cells`, `scanner`, `structurer`, `parse`,
`step_kind`, `step_role`, `handler`, `errors`, `expression`, `registry`,
`sentences`, `matcher`, `diagnostics`, `cell_diff`, `plan`, `doc_string_diff`,
`param_diff`, `failure`, `failure_anchor`, `execute`, `hash`, `drift`,
`conformance`. `result.rs`'s `SpecResults` is deferred (unused by the adapter
path in v1, as in Rust).

## Key design decisions

- **`Value`** is a tagged struct (`Kind` + typed fields + `map[string]Value`),
  not `interface{}` — so switches are exhaustive, map equality is
  order-insensitive, and `Int(2) != Float(2.0)` holds. Ergonomic `AsInt`/
  `AsString`/`AsMap`/… accessors keep fixtures clean.
- **Canonical JSON** is hand-rolled (recursive UTF-16 key-sort, 2-space indent,
  LF + trailing newline, raw non-ASCII, control chars `\uXXXX`, integral floats
  as ints) — the stdlib `encoding/json` does not sort keys recursively nor append
  the trailing newline. Proven byte-exact against a golden first.
- **UTF-16 offsets** (see ADR 0010): a single conversion layer; every stored
  offset is UTF-16, byte offsets are transient locals.
- **cucumber-expressions** via the official (stale v6.2.0) Go library for
  compile/match/offsets/group-tree, with var's own transforms applied (ADR 0010).
- **Author API** (see ADR 0010 fork points): injected `Steps` builder,
  full-replacement `Value` state, `runtime.Caller` source capture, one variadic
  handler shape, panic-recovered assertion channel (Go has no async variant —
  handlers are ordinary blocking funcs).

## Conformance staging (the spine)

Same four gated milestones as every port, each independently green before the
next: `var-doc.json` (parse) → `registry.json` (registration; needs the
per-bundle `*.steps.go` fixtures) → `plan.json` (match + plan) → `trace.json`
(execute). The three projections (`ToVarDocArtifact`, `ToRegistryArtifact`,
`ToPlanArtifact`) and the inline trace build in `RunConformance` are ported
exactly from `conformance.ts`/`conformance.rs`. Drift is unit-gated (no golden)
by translating the shared `hash`/`drift` vectors.

## Fixture wiring

The 15 `*.steps.go` fixtures live in the shared corpus
(`conformance/bundles/<n>/<stem>.steps.go`, `package fixture`, exposing
`Register(*varar.Steps)` and `State() varar.Value`) so goldens stay shared
(serialized by stem). Because Go compiles by directory, each fixture is
**symlinked** into its own `go/conformance/bNN/` package (Go compiles symlinked
source files, even to targets outside the module), and the conformance test in
`go/varar` imports them with aliases and dispatches by bundle name — the Go
analogue of Rust's `#[path]` and Java's test-source-root trick, keeping the
neutral corpus free of Go build files.
