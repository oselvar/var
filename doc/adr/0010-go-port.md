# ADR 0010 — Go as a supported language (full pipeline port)

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** Aslak Hellesøy
- **Tags:** go, language-support, cross-language, cucumber-expressions

## Context

[ADR 0001](0001-second-language-python.md) evaluated Go and deliberately set it
aside as the *second* language ("strong agentic momentum and a not-loved
incumbent `godog`; a good fit for var's design values — immutable, pure-functional
core; smaller market than Python; reconsider as a later language"). Python, Java,
Kotlin, Ruby, Rust, and C# have since shipped as complete ports. Go is now picked
up as the next full-pipeline port.

Why now:

- **Design fit.** var's core is pure functions over immutable data. Go's value
  semantics, explicit error returns, and lack of hidden control flow map cleanly
  onto that model — the same fit that made Rust and C# smooth ports.
- **Agentic reach.** Go remains a first-choice language for infrastructure and
  cloud-native services where AI-assisted development is heavy, extending the
  primary goal of ADR 0001.
- **A beatable incumbent.** `godog` is Gherkin-first and table-test-cultured; var's
  Gherkin-free Markdown examples are a differentiated offer, matching the
  secondary goal.

Go shares **no runtime** with any existing port, so — per the skill's "full port
vs. facade" rule — it is a **full pipeline port**, gated on all four shared
conformance artifacts (var-doc / registry / plan / trace), not a facade over an
existing engine.

## Decision

**Support Go as a full pipeline port**, structured exactly like the other ports:
`varcore` (pure pipeline), the `varar` author facade, `varconfig`, `varrunner`,
and the `vargotest` adapter, laid out as packages of a single Go module
`github.com/varar-dev/varar-go` rooted at `go/`. Correctness is proven by
reproducing `conformance/bundles/*/golden/*.json` byte-for-byte (all four
artifacts, all 15 bundles) and `conformance/config/cases/*` for the config
reader; drift is unit-gated against the shared FNV-1a / lockfile vectors.

### Author-API fork points (recorded per the skill)

- **Registration:** injected **Steps builder** (`Register(*varar.Steps)`), like
  Rust/Java/Kotlin/C# — no module-scope accumulator. Go has no clean
  import-for-side-effect story, and the builder keeps registration explicit.
- **State evolution:** **full-replacement** immutable `Value` (a stimulus returns
  the whole next state), like Rust/Java/C#.
- **Step source location:** captured from the call site via `runtime.Caller`
  (Go's `#[track_caller]` analogue); the file's stem (`numerals.steps`) is the
  cross-language trace `stepFile`.
- **Handler shape:** a single variadic `func(state Value, args []Value)
  HandlerReturn` — args are the expression captures plus any trailing
  table/doc-string, in slot order. Go cannot infer closure arity the way Rust's
  `IntoHandler` trait does, so one explicit shape is the least-surprising choice;
  ergonomic `Value` accessors (`AsInt`, `AsString`, `AsMap`, …) keep fixtures
  clean. Failure is signalled by returning `Fails(msg)` or panicking (recovered
  as the assertion channel).

### String-offset units

Go strings are UTF-8 byte-indexed, but every golden offset is a **UTF-16
code-unit** offset. Like Rust and Python, the port carries a conversion layer
(`utf16Len`/`utf16Index`/`byteIndex`/`utf16Slice`, `unicode/utf16` for line/col),
converting the byte offsets from `strings.Index` / the `regexp` package / the
cucumber-expressions library to UTF-16 at every span-production site. Verified
against bundles `11-emoji-offsets` and `12-combining-marks`.

### Cucumber-expressions dependency (a documented exception)

The skill directs each port to depend on the **official cucumber-expressions
package** for its language, pinned to the 20.0.0 line, and to *not* re-implement
regex generation. Go's situation is between the ideal (an official 20.0.0 package,
used by TS/Python/Java/Ruby) and Rust's (no official crate, hand-rolled):

- An official Go implementation exists —
  `github.com/cucumber/cucumber-expressions-go` — but its latest published
  version is **v6.2.0**, not the 20.0.0 line.
- Its built-in `{int}`/`{word}`/`{string}` regexps are **byte-identical** to the
  reference's (`-?\d+`|`\d+`, `[^\s]+`, the quoted-string pattern), and its
  `Group` tree (whole-match value, inner-group values, byte offsets) maps exactly
  onto the reference's `match_whole` contract.

**Decision:** depend on the official `cucumber-expressions-go` library for
expression compilation, regexp generation, whole-string matching, and the capture
group tree; apply var's *own* value transforms (a bare `Group.Value()` for the
built-ins, the inner capture groups for a custom type — the same rule every port
follows), and read parameter-type names directly from the source `{name}` tokens.
This honours "use the official library, don't re-implement the grammar" as far as
the ecosystem allows, and is proven correct by the shared goldens. Only `{int}`,
`{word}`, `{string}` and author-defined custom types are exercised by the corpus.

## Consequences

- Go joins the shared conformance matrix with no changes to the corpus goldens —
  only new `conformance/bundles/*/*.steps.go` fixtures (byte-identical goldens,
  serialized by stem).
- The `vargotest` adapter's `go test` integration mechanism is recorded
  separately in [ADR 0011](0011-go-test-integration.md).
- Registry publishing (Go modules via a `go/vN` tag on the module path) is scoped
  with the repo/release integration; like Rust and C#, it may be parked initially.
- The stale cucumber-expressions dependency is a watch item: if a 20.0.0-line Go
  release appears, migrating to it should be transparent (the built-ins already
  match) and is preferred.
