# .NET core + facade — design (sub-project 1 of the .NET port)

Date: 2026-07-19
Status: design, pending implementation (TDD)

First sub-project of the .NET (C#) port ([ADR 0008](../../adr/0008-dotnet-port.md)),
landing on top of the [Varar rename](../../RENAME-VARAR.md). Scope is the **pure
C# runtime core** (`Varar.Core`) plus the **`Varar` author facade** — a native
port of `@varar/core`'s pipeline and the authoring API. The `Varar.Config`
reader, the `Varar.Runner` shell, and the `Varar.TestAdapter` are deferred to
[sub-project 2](2026-07-19-dotnet-runner-adapter-design.md); they bind a runner
to this proven core and add nothing the conformance suite can police.

Java and Rust are the closest precedents (both are statically-typed full ports
whose author API settled on the injected-Registrar + full-replacement-state
forks). Read
[`2026-07-01-java-core-port-design.md`](2026-07-01-java-core-port-design.md) and
[`2026-07-12-rust-facade-runner-adapter-design.md`](2026-07-12-rust-facade-runner-adapter-design.md)
alongside; the [Python core design](2026-06-30-python-core-port-design.md)
remains the canonical staging narrative. (Those dated docs predate the rename and
use the old `@oselvar/var-*` / `var-core` names; the code they cite now lives
under the renamed paths in the table below.)

## Why this scope

The pure core is the foundation the runner sits on, with a hard, objective
"done" signal: it reproduces the **existing shared conformance goldens
byte-for-byte**. The TypeScript implementation is the reference; the C# core
passes when its four projected artifacts equal the committed `golden/*.json` for
every bundle. Nothing about `dotnet test` ergonomics is needed to prove the core
is correct.

## Architecture — a C# mirror of the immutable functional core

`Varar.Core` mirrors `@varar/core` module-for-module: pure functions over
immutable data — no filesystem, network, globals, or time. The project's
non-negotiables (CLAUDE.md) translate to C# idiom as:

- **Immutable types** → `sealed record` with `init`-only properties for every
  AST / plan / diff node; `ImmutableArray<T>` for `ReadonlyArray<T>`;
  `ImmutableDictionary<K,V>` (or `IReadOnlyDictionary`) for `ReadonlyMap<K,V>`.
  Records give structural value equality — used directly for the deep-equal
  comparisons. Updates produce new values (`with` expressions).
- **Pure functions** → `parse`, `match`, `plan`, the diffs, the conformance
  projections: same input → same output, no side effects. Static methods on
  static classes (no ambient state).
- **Functional core / imperative shell** → `Varar.Core` + `Varar` are pure;
  module loading, discovery, the `dotnet test` binding, and file I/O live in the
  later runner/adapter sub-project.
- **No `deep_freeze` needed** → unlike Python/Ruby (which freeze a mutable
  dict), C# state is a **full-replacement immutable `Value`** (see the author
  API), so immutability is a type guarantee, as in Rust/Java.
- **Nullable reference types enabled**, `TreatWarningsAsErrors`; target the
  current .NET LTS (`net10.0`), pinned in `global.json`.

## Author API — injected Registrar, full-replacement state

Two forks are settled by matching the static-language ports (ADR 0008), not the
dynamic ones:

- **Registration = injected Registrar.** A step file exposes a registration
  function replayed against a fresh registry each run — no module-scope
  accumulator (`[ModuleInitializer]` runs once per assembly load, not per run).
  Shape (facade):

  ```csharp
  using Varar;

  public static class CounterSteps
  {
      public static Registry Register(Registry r)
      {
          var s = r.DefineState(() => Value.Of(new { count = 0 }));
          r = s.Stimulus("I increment", (state) =>
              Value.Of(new { count = state["count"].AsInt() + 1 }));   // full next state
          r = s.Sensor("the count is {int}", (state, n) => state["count"]);
          return r;
      }
  }
  ```

  `DefineState(factory)` returns a binder carrying the file's context factory
  (a fresh state per example; states never bleed across step files). `Stimulus`
  and `Sensor` take a Cucumber expression + a handler and return the updated
  `Registry`. The handler's function name is never matched.

- **State evolution = full replacement.** A `stimulus` returns the **whole next
  state** as a `Value` (not a partial merge). This changes the executor's merge
  step and the sensor slot contract versus TS/Python — decide it in Task 1.

- **Handler shape (arity).** The *facade* provides delegate overloads for the
  common arities so authors write bare lambdas without naming the arity
  (`Func<Value, Value>`, `Func<Value, Value, Value>`, …), inferring each capture
  from the compiled expression — the C# analog of Rust's `IntoHandler`. The
  *core* keeps explicit fixed-arity/variadic handler constructors for its own
  tests. 3+-capture and `async` (`Func<…, Task<Value>>`) forms stay explicit.

- **Step source location = call-site capture.** `Stimulus`/`Sensor` capture
  `[CallerFilePath] string file = ""`, `[CallerLineNumber] int line = 0` — C#'s
  native facility (Rust's `#[track_caller]` analog). The fixture path's stem
  (`Path.GetFileNameWithoutExtension("numerals.steps.cs")` → `numerals.steps`)
  is the canonical cross-language `stepFile`; `line` is diagnostic-only (in no
  golden). Authors never pass `file`/`line`.

- **`DefineParameterType(name, regexp, transform)`** mirrors the core
  `defineParameterType` (and the `_with_format` variant for bundle 15).

### The `Value` type (central author-API type)

Handlers produce and compare arbitrary data (state, captured args, returns), so
the core needs one immutable data representation — mirroring Rust's `Value` /
Java's value type. `Value` is a `sealed record` discriminated union
(null/bool/int/double/string/list/map) with structural deep equality, built from
POCOs/anonymous objects via `Value.Of(...)` and read via typed accessors
(`AsInt()`, `["key"]`, …). It is the type the diff engine deep-compares against
transformed args and the type a sensor returns. Keep its equality semantics
identical to TS `deepEqual` (this is what `CellDiff` is derived from).

## Dependencies

- **Runtime: `Cucumber.CucumberExpressions` `20.0.0`** only — exact version
  parity with the TS core's `@cucumber/cucumber-expressions ^20.0.0` (official
  package, published by the Cucumber org, .NET Standard 2.0). **Do not
  reimplement the grammar/regexp generation** — the matcher ports only Varar's
  own hit-resolution, ambiguity detection, and offset-shifting around the
  library. Parameter-type names come from the compiled expression AST (parameter
  nodes), never parsed from `{...}`; a custom type's `regexp` serializes as its
  bare source.
- **Dev:** the current .NET SDK, `dotnet format`, Roslyn analyzers. The
  conformance harness is a plain test project (framework choice is a harness
  detail, not shipped).
- **No** Node, JVM, Python, or sidecar dependency.

## Character offset semantics — UTF-16 (expected free, must be verified)

Every offset in the goldens is a **UTF-16 code-unit** offset (😀 counts as 2).
C# `string` is UTF-16 code-unit indexed — `string.Length`, `s[i]`, `Substring`,
and `Regex` `Match.Index` all count `char` (UTF-16 code units), **identical to
JS and the JVM**. So, unlike Python (which needed a whole `utf16_len` /
`to_utf16_offset` conversion layer), the C# port is expected to need **no
conversion**: the scanner counts `char`, and the cucumber-expressions
`Argument`/`Group` offsets are already `char` indices.

**This is an expectation, not a licence to skip verification.** Gate the parse
and plan stages on bundles `11-emoji-offsets` and `12-combining-marks` (astral
chars, BMP multi-byte, combining marks) before declaring them done. If, against
expectation, the cucumber package returns code-point or byte offsets, add a
localized conversion in the matcher only (as Python did) — but the parse stage
should stay conversion-free.

## Module map (`@varar/core` `src/*.ts` → `Varar.Core`)

Port these modules, keeping names parallel (PascalCase files/types per C#
convention). The TS reference now lives at `typescript/packages/core/src/*.ts`;
mirrors at `python/packages/core/src/varar_core/*` and `java/core/**`:

| Concern | TS (`packages/core/src`) | C# (`Varar.Core`) |
|---|---|---|
| Positions | `span.ts` | `Span.cs` |
| AST | `ast.ts` | `Ast.cs` |
| Markdown parse | `scanner.ts`, `structurer.ts`, `inline.ts`, `parse.ts`, `sentences.ts` | `Scanner.cs`, `Structurer.cs`, `Inline.cs`, `Parse.cs`, `Sentences.cs` |
| Step roles | `step-role.ts` | `StepRole.cs` |
| Registry / author API | `registry.ts` (+ facade `internal.ts`) | `Registry.cs` (+ facade `DefineState.cs`) |
| Matching | `matcher.ts` | `Matcher.cs` |
| Planning | `plan.ts` | `Plan.cs` |
| Diagnostics | `diagnostics.ts` | `Diagnostics.cs` |
| Execution | `execute.ts` | `Execute.cs` |
| Diffs / failures | `cell-diff.ts`, `doc-string-diff.ts`, `param-diff.ts`, `table-cells.ts`, `failure.ts`, `result.ts`, `deep-freeze.ts` | `CellDiff.cs`, `DocStringDiff.cs`, `ParamDiff.cs`, `TableCells.cs`, `Failure.cs`, `Result.cs` (no `DeepFreeze` — immutable by type) |
| Data value | `deep-equal.ts` | `Value.cs` (+ deep equality) |
| Conformance | `conformance.ts` | `Conformance.cs` |
| Canonical JSON | (in `conformance.ts`) | `CanonicalJson.cs` |
| Drift (unit-gated) | `hash.ts`, `drift.ts` | `Hash.cs`, `Drift.cs` |
| Port interface | `ports.ts` (`BaselineStore`) | `IBaselineStore.cs` (impl in runner) |

Out of scope for the core (authoring/CLI/runner concerns): `config.ts`,
`find-files.ts`, `snippet*`, scanner *plugins* beyond those a bundle exercises,
LSP. Each module's TS `*.test.ts` is the authoritative spec — translate the test
first (watch it fail), then the implementation.

## Canonical JSON — configure `System.Text.Json`, then wrap

`System.Text.Json` is *almost* conformant but, like every other port's stdlib
writer, cannot be used raw:

- **Recursive key sort:** `System.Text.Json` preserves insertion order and does
  not sort — wrap it with a recursive key-sort (emit through a sorted
  `JsonObject`, or sort while writing with `Utf8JsonWriter`).
- **Non-ASCII raw:** the default encoder escapes non-ASCII (and `<>&+`) to
  `\uXXXX` — configure `JavaScriptEncoder.UnsafeRelaxedJsonEscaping` so emoji/CJK
  /accents appear literally.
- **2-space indent:** `JsonWriterOptions { Indented = true }` (2 spaces is the
  default; on `net9+` `IndentSize`/`IndentCharacter` are configurable — leave at
  2).
- **LF + trailing newline:** the writer emits `\n`; append the trailing `\n`
  yourself.
- **Step-def files by stem:** `numerals.steps.cs` serializes as `numerals.steps`
  so goldens stay shared.

Prove it byte-exact against a golden in Task 1, before any pipeline module.

## Test oracle — conformance goldens, staged by artifact

"Done" = the C# core reproduces every bundle's committed goldens byte-for-byte. A
new C# conformance harness (a test project under `dotnet/`) iterates
`conformance/bundles/*` (sibling of `dotnet/` at the repo root), and for each
bundle loads its `*.steps.cs` fixture to build the registry, reads `example.md`,
runs the pipeline, projects the four artifacts, serializes with `CanonicalJson`,
and asserts equality against the same `golden/*.json`. Staged as four
independently-gated milestones (the plan's spine):

1. **`var-doc.json`** — parse only (scanner/structurer/inline → AST + spans). No
   fixtures needed. Gate on `11`/`12` for UTF-16 fidelity.
2. **`registry.json`** — `DefineState` + cucumber-expression compilation →
   ordered `{expression, parameterTypeNames}` (+ custom `{name, regexp}`). From
   here every bundle needs a **`*.steps.cs` fixture**.
3. **`plan.json`** — matcher + planner → `matchSpan`, `paramSpans`,
   `matchedExpression`, `args`, table/doc-string attachment, ambiguity
   diagnostics, `error`-fence semantics.
4. **`trace.json`** — executor (full-replacement state merge) + diffs +
   structured `FailureArtifact`s + per-example outcomes.

The three projections (`toVarDocArtifact`, `toRegistryArtifact`,
`toPlanArtifact`) live in TS `packages/core/src/conformance.ts`; the trace stage
is built inline inside `runConformance` — port each exactly.

## Drift (unit-gated, not golden-gated)

Port `Hash.cs` (FNV-1a over UTF-16 code units → `fnv1a:<8 hex>` — iterate `char`,
which is already a UTF-16 code unit) then `Drift.cs` (Jaccard word-similarity,
`DRIFT_SIMILARITY_THRESHOLD = 0.5`, ported byte-identically) + the
`IBaselineStore` port interface (filesystem impl lives in the runner). Proven by
**translating the TS unit tests** (`hash.test.ts`, `drift.test.ts`), not goldens.
`varar.lock.json` uses its own serializer (`JSON.stringify(_, null, 2) + "\n"`,
spec paths sorted but insertion-order keys otherwise) — **not** `CanonicalJson`'s
recursive sort. Follow the Java `Drift.java`/`Hash.java` precedent (`java/core`).

## Purity gate

`Varar.Core` must reference nothing from `Varar`/`Varar.Runner`, and the facade
must not reach past the core into pipeline internals. Enforce with a
project-reference/grep check in `make dotnet` (the C# analog of the Python
`grep -rn "from var\b"` gate).

## Risks

- **Span fidelity (milestone 1).** Expected free (UTF-16 native) but must be
  proven on `11`/`12` — do not assume.
- **cucumber-expressions offset units (milestone 3).** Confirm the package's
  `Argument`/`Group` offsets are `char` indices; add a localized matcher
  conversion only if not.
- **`Value` equality parity.** `Value` deep equality must match TS `deepEqual`
  exactly — it is what `CellDiff` is derived from.
- **Full-replacement vs partial-merge.** The executor merge + sensor slot
  contract differ from TS/Python; settle in Task 1.

## Open questions

- Exact public surface of `Cucumber.CucumberExpressions` v20
  (`CucumberExpression`, `ParameterTypeRegistry`, `Argument.Group.Start/End`,
  `.Value`) — confirm at implementation start; the matcher wrapper adapts to it.
- Whether any bundle exercises a scanner *plugin* that must be ported for
  milestone 1/3 — audit the corpus during planning.

## References

- [ADR 0008 — .NET port](../../adr/0008-dotnet-port.md)
- [Varar rename plan](../../RENAME-VARAR.md)
- [Python core port design](2026-06-30-python-core-port-design.md) (canonical staging)
- [Java core port design](2026-07-01-java-core-port-design.md) (static-language forks)
- [Rust facade/runner/adapter design](2026-07-12-rust-facade-runner-adapter-design.md)
- Reference implementation: `typescript/packages/core/src/*`,
  `typescript/packages/varar/src/internal.ts`; mirror at
  `python/packages/core/src/varar_core/*`, `java/core/**`.
