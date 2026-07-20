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
`github.com/varar-dev/varar/go` rooted at `go/`. Correctness is proven by
reproducing `conformance/bundles/*/golden/*.json` byte-for-byte (all four
artifacts, all 15 bundles) and `conformance/config/cases/*` for the config
reader; drift is unit-gated against the shared FNV-1a / lockfile vectors.

### Author-API fork points (recorded per the skill)

- **Registration:** injected **Steps builder** (`Register(*varar.Steps)`), like
  Rust/Java/Kotlin/C# — no module-scope accumulator. Go has no clean
  import-for-side-effect story, and the builder keeps registration explicit.
- **State evolution:** **full-replacement** (a stimulus returns the whole next
  state), like Rust/Java/C# — but the state is the author's own type, not a
  dynamic `Value`. `Steps` is generic in it:

  ```go
  type Ctx struct{ Loans []Loan; Fee int }

  func Register(s *varar.Steps[Ctx]) {
      s.Stimulus("returns it on {date}",
          func(ctx Ctx, returned Date) (Ctx, error) { … })
  }
  ```

  `varar-core` therefore treats the state as an opaque `any`: it threads it
  between a file's steps and replaces it wholesale, but never compares,
  serializes, or inspects it — no conformance artifact contains the state. Use
  `Steps[varar.Value]` for dynamic, schemaless state (what the conformance
  fixtures do).
- **Step source location:** captured from the call site via `runtime.Caller`
  (Go's `#[track_caller]` analogue); the file's stem (`numerals.steps`) is the
  cross-language trace `stepFile`.
- **Handler shape:** a single variadic `func(state Value, args []Value)
  (*Value, error)` — args are the expression captures plus any trailing
  table/doc-string, in slot order. The return is the idiomatic Go `(value,
  error)` pair rather than a bespoke tri-state type: `(nil, nil)` is "no
  assertion / no change", `(&v, nil)` carries a value, `(nil, err)` is a
  failure; panicking is equivalent to returning an error (the executor recovers
  it, so panicking assertion libraries work unchanged). `Ptr(v)` is the
  one-liner for the value case. Ergonomic `Value` accessors — the `As*` pair
  form and the panicking `Must*` form, plus `CloneMap` for building the next
  state — keep step files free of hand-rolled coercion helpers.

  **Plain Go parameters (the ergonomic form).** `Sensor`/`Stimulus` also accept
  a handler whose parameters are plain Go values — the first is always the
  state, the rest are the step's slots — with a sensor returning one value per
  slot:

  ```go
  s.Sensor("The square of {int} is {int}.",
      func(state varar.Value, n, square int) (int, int, error) { return n, n * n, nil })
  ```

  This is the same slot contract every port shares — TypeScript spells the
  two-slot return as the tuple `[n, n * n]`; Go spells it as two return values.
  A sensor's return type per slot equals that slot's parameter type, because the
  core compares the two — a different type could never be equal.

  A first draft of this ADR justified a single fixed `[]Value` shape by saying
  Go cannot infer closure arity the way Rust's `IntoHandler` trait does. That is
  true of Rust's *compile-time trait dispatch* but it is not the mechanism godog
  uses: godog's `ctx.Step(expr, handler)` accepts `func(name string, age int)
  error` via **runtime reflection**, and so does this.

  Generics were prototyped first, as `Sensor1`/`Sensor2`/… — they buy real
  compile-time checking (a return type that does not match its slot, or an
  unsupported parameter type, becomes a compile error), but Go has no variadic
  generics, so the arity has to live in the name. Numbered functions are not a
  Go idiom; reflection is how Go does variable arity, and the checking that is
  lost is largely recovered by validating the handler signature **eagerly at
  registration**, so a malformed handler fails when the suite wires up rather
  than when that step happens to run. Only two checks are deferred to match
  time, both because they depend on the document rather than the code: the slot
  count an expression actually produced, and a slot whose runtime kind does not
  match the declared type.

  **Domain types as slots.** Java can hand a handler a `LocalDate` because its
  core is `Object`-based, so a custom parameter type's transform result flows
  through untouched. Go's core uses a closed `Value` union, so the facade
  bridges instead: a type that implements `ValueDecoder` (and, for a sensor
  slot, `ValueEncoder`) can be a step parameter directly —

  ```go
  func (d *Date) DecodeVarValue(v varar.Value) error { … }
  func (d Date) EncodeVarValue() varar.Value         { … }

  s.Stimulus("borrowed {title}, due back on {date}",
      func(state varar.Value, title string, due Date) (varar.Value, error) { … })
  ```

  — the `json.Unmarshaler`/`Marshaler` pattern, keeping the core free of any
  knowledge of author types. Named primitives (`type Celsius int64`) need no
  interface; the reflect Kind is enough.

  The reflection lives entirely in the facade; `varar-core` stays
  reflection-free. The raw `func(state Value, args []Value) (*Value, error)`
  form is still accepted under the same name — the escape hatch for whole-table
  slots and for header-bound rows, which compare by column rather than
  positionally by slot. Both forms appear in the conformance corpus.

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
