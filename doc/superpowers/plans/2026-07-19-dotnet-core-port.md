# .NET core + facade — task plan (sub-project 1 of the .NET port)

**REQUIRED SUB-SKILL:** superpowers:executing-plans or
superpowers:subagent-driven-development. Load the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill.

Design: [`2026-07-19-dotnet-core-port-design.md`](../specs/2026-07-19-dotnet-core-port-design.md).
ADR: [0008](../../adr/0008-dotnet-port.md). Builds on the
[Varar rename](../../RENAME-VARAR.md) (packages under the `varar` base;
`varar.config.json`/`varar.lock.json`; specs in `varar-examples/`).

## Goal

Bring the .NET port from nothing to **`Varar.Core` + `Varar` facade
conformance-green on all four artifacts × 15 bundles**, with drift unit-gated.
The config reader, runner, and VSTest adapter are
[sub-project 2](2026-07-19-dotnet-runner-adapters.md).

## Global constraints

- **Translate, don't redesign** — the TS module + its `*.test.ts` are the spec
  (`typescript/packages/core/src/*`).
- Every core module is proven by **reproducing shared goldens byte-for-byte**;
  drift is the one unit-gated feature. Never hand-write new conformance tests.
- The facade must not reach past the core into pipeline internals; the core
  references nothing from the facade/runner (project-reference/grep gate).
- Each task ends green + `dotnet format --verify-no-changes` + one commit.
- Commits are `chore(dotnet)`/`docs(dotnet)`/`test(...)` until the NuGet release
  target lands (sub-project 2); only then may `feat(dotnet/<pkg>)` be used.

## Author-API forks (settled in ADR 0008 — implement in Task 2, don't re-litigate)

- Registration: **injected Registrar** (`Register(Registry) -> Registry`).
- State: **full replacement** (`stimulus` returns the whole next `Value`).
- Source location: **`[CallerFilePath]`/`[CallerLineNumber]`** call-site capture.
- Handler arity: facade delegate overloads (0/1/2) + explicit core constructors.

## Dependency order

`T0` → `T1` → `T2` → `T3` (var-doc) → `T4` (registry) → `T5` (plan) → `T6`
(trace) → `T7` (drift). `T7` is independent of `T4`–`T6` and may be scheduled any
time after `T1`.

---

### T0 — `dotnet/` workspace + purity gate (S)
`Varar.sln`, `global.json` pinning the LTS SDK, `Varar.Core` + `Varar` skeleton
projects (nullable enabled, `TreatWarningsAsErrors`), a green smoke test, and the
project-reference purity check. No pipeline code. Reference
`Cucumber.CucumberExpressions 20.0.0`. **Confirm** its `Argument`/`Group` offset
API returns `char` (UTF-16) indices — record the finding.

### T1 — `CanonicalJson` + `Value` + `Span` (M)
1. `Value.cs` (discriminated `sealed record`, `Value.Of`, typed accessors) with
   TS-`deepEqual`-identical structural equality — translate the `deep-equal`
   tests first.
2. `CanonicalJson.cs`: `System.Text.Json` + `UnsafeRelaxedJsonEscaping` + 2-space
   indent, wrapped with a recursive key-sort + trailing `\n`, step-def files by
   stem. **Prove byte-exact against one committed golden** before any pipeline
   module.
3. `Span.cs` (+ `lineCol` counting `char`/UTF-16 units).

### T2 — Facade: `DefineState` / `Registry` (M)
Port `registry.ts` + facade `internal.ts` into `Registry.cs` + `DefineState.cs`
with the four forks above. Unit-translate the registry tests. No matching yet.

### T3 — MILESTONE `var-doc.json`: parse (L)
Port `scanner`, `structurer`, `inline`, `sentences`, `parse`, `ast`, `step-role`
(translate each `*.test.ts` first). Stand up the conformance harness iterating
`../conformance/bundles/*`, projecting `toVarDocArtifact`. **Exit:
`var-doc.json` byte-for-byte × 15 bundles, including `11-emoji-offsets` /
`12-combining-marks`** (proves UTF-16 fidelity — no conversion layer expected;
if the goldens miss, localize a conversion, do not touch the parse counts).

### T4 — MILESTONE `registry.json`: registration (M)
1. Author `conformance/bundles/<n>/*.steps.cs` for all 15 bundles (same
   expressions + deterministic handlers as `.steps.ts`; serialized by stem
   `numerals.steps`). **Test-first: wire the gate red, then fill fixtures.**
2. Compile expressions via `Cucumber.CucumberExpressions`; project
   `toRegistryArtifact` (ordered `{expression, parameterTypeNames}` + custom
   `{name, regexp}`). **Exit: `registry.json` × 15 byte-for-byte.**

### T5 — MILESTONE `plan.json`: match + plan (L)
Port `matcher` (Varar's hit-resolution/ambiguity/offset-shifting around the
library — **not** the grammar), `plan`, `diagnostics`. Project `toPlanArtifact`
(`matchSpan`, `paramSpans`, `matchedExpression`, `args`, table/doc-string
attach, `error`-fence semantics, ambiguity diagnostics). **Exit: `plan.json` ×
15 byte-for-byte**, confirming cucumber offsets need no conversion on `11`/`12`.

### T6 — MILESTONE `trace.json`: execute (M)
Port `execute` (full-replacement state merge), `cell-diff`, `doc-string-diff`,
`param-diff`, `table-cells`, `failure`, `result`. Build the trace projection
inline (as TS `runConformance` does). **Exit: `trace.json` × 15 byte-for-byte →
all four artifacts green.**

### T7 — Drift (unit-gated) (S)
Port `Hash.cs` (FNV-1a over UTF-16 code units) then `Drift.cs` (Jaccard,
threshold `0.5`) + the `IBaselineStore` interface. Translate `hash.test.ts` /
`drift.test.ts`. `varar.lock.json` uses its own serializer (not `CanonicalJson`)
— follow Java `Hash.java`/`Drift.java` (`java/core`). **Exit: ported unit tests
green.**

### T8 — Verify (S)
All four artifacts × 15 bundles byte-for-byte; drift tests green; purity gate
green; `dotnet format --verify-no-changes`. Hand off to sub-project 2.

## Risks

- **UTF-16 (T3/T5):** expected free but must be proven on `11`/`12` — do not
  assume.
- **cucumber-expressions offset units (T5):** confirm `char` indices in T0;
  localize a matcher conversion only if not.
- **`Value` equality parity (T1):** must equal TS `deepEqual` — it underpins
  `CellDiff`.
- **NuGet package-id availability** (`Varar.Core`, `Varar`, `Varar.Config`,
  `Varar.Runner`, `Varar.TestAdapter`) — check before the release target in
  sub-project 2.
