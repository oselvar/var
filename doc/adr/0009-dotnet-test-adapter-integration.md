# ADR 0009 — .NET test integration via a custom VSTest adapter (`ITestDiscoverer`/`ITestExecutor`)

- **Status:** Proposed
- **Date:** 2026-07-19
- **Deciders:** Aslak Hellesøy
- **Tags:** dotnet, csharp, vstest, test-runner-adapter, cross-language

## Context

.NET is the seventh language port ([ADR 0008](0008-dotnet-port.md)). Each
existing adapter (the vitest, pytest, JUnit, Kotest, and cargo adapters) gives
**one independently selectable/reportable test per Markdown example**, with
failures rendered anchored to the `.md` source span. The .NET adapter (package
`Varar.TestAdapter`) must give the same guarantee for how .NET users actually run
tests: `dotnet test`, the Test Explorer in Visual Studio / Rider / VS Code, and
CI runners — all of which speak the **VSTest** platform.

The .NET analog of "the JUnit Platform" (the launcher infrastructure IDEs and
build tools speak, on top of which specific frameworks are engines) is the
**VSTest platform**: `dotnet test` / `vstest.console` load *test adapters* that
implement discovery and execution SPIs, and xUnit / NUnit / MSTest are each just
adapters on it — the direct structural parallel to JUnit Platform *engines*
([ADR 0003](0003-java-junit-integration.md)). A newer platform,
**Microsoft.Testing.Platform (MTP)**, is emerging but VSTest remains the
broadly-supported entry point; this ADR targets VSTest and treats an MTP bridge
as later, additive work.

### Options considered

**A. Custom VSTest adapter** — implement
`Microsoft.VisualStudio.TestPlatform.ObjectModel.Adapter.ITestDiscoverer` +
`ITestExecutor`, annotated with `[FileExtension(".dll")]`,
`[DefaultExecutorUri("executor://varar")]`, and shipped in an assembly named
`*.TestAdapter.dll` so `dotnet test` auto-loads it once the package is
referenced (no user wiring — the ergonomic parallel to the JUnit adapter's
ServiceLoader and the pytest adapter's `pytest11` entry point). The adapter:
- **Discovery** (`DiscoverTests`): given the built test assembly, locates the
  workspace `varar.config.json`, globs the configured `.md` specs, parses+plans
  each via `Varar.Runner`, and emits one `TestCase` per planned example —
  **before any test runs** — with `CodeFilePath`/`LineNumber` pointing at the
  `.md` example line, so IDEs and `dotnet test --filter` can select and report
  each example individually.
- **Execution** (`RunTests`): executes each `TestCase` (or re-discovers from a
  source), delegates to `Varar.Runner`'s `run_spec` equivalent, and maps the
  core's span-anchored failures to `TestResult` with the `.md` location.

**B. Data-driven tests on an existing framework** — an xUnit `[Theory]` +
`TheoryData`/`ClassData`, an NUnit `[TestCaseSource]`, or an MSTest
`[DynamicData]` source that enumerates examples, one case per example.

### Why not B

- **Ties Varar to one assertion framework.** Varar's adapter contract is
  framework-neutral; the cross-language promise is "install the package, run
  your tests," not "adopt xUnit." B would force a framework choice on the user
  and would need re-implementing per framework (xUnit *and* NUnit *and* MSTest)
  to match the reach a single VSTest adapter gets for free.
- **Weaker discovery-time visibility.** Several of these sources materialize
  cases during execution of the containing method (or bury examples under a
  parent theory node), degrading "one independently selectable test per example"
  in exactly the way JUnit `@TestFactory` did ([ADR 0003](0003-java-junit-integration.md),
  Options B/C). A VSTest adapter surfaces each example as a first-class,
  discovery-time `TestCase`.

## Decision

**`Varar.TestAdapter` implements a custom VSTest adapter** (`ITestDiscoverer` +
`ITestExecutor`), auto-loaded by `dotnet test` via the `*.TestAdapter.dll`
convention and `[DefaultExecutorUri]`:

- Executor URI `executor://varar`; registered for `[FileExtension(".dll")]` (the
  built test project is the discovery *source*; the `.md` specs are found
  relative to it via `varar.config.json`).
- One `TestCase` per `PlannedExample`; `FullyQualifiedName` = `<spec-relative
  path>::<example name>` (stable across runs so re-run-single-test round-trips);
  `TestCase.CodeFilePath` = the `.md` path, `LineNumber` = the example's source
  line — never adapter internals.
- Execution delegates leaf runs to `Varar.Runner`, reusing the pure core's diffs
  / `to_failure` payloads for span-anchored messages — same contract as every
  other adapter; no failure text re-derived in the adapter.
- **Config:** the shared `varar.config.json` (via `Varar.Config`), resolved from
  the assembly/workspace root — **not** a reinvented `.runsettings` schema (a
  `.runsettings` may point at the workspace root, but the canonical
  `docs`/`steps` globs live in `varar.config.json`, shared verbatim with every
  other port).
- **Drift gate:** reconcile each spec against `varar.lock.json` via the runner's
  filesystem `BaselineStore` + `reconcileDrift`, surface a `drift` failure on the
  same rail as `ambiguous-match`, write the baseline on a clean run, and honour
  an acknowledgment path (a `VAR_UPDATE` env var / `.runsettings` parameter) —
  never silently accept drift ([ADR 0002](0002-drift-detection-and-acknowledgment.md)).
- **Language-neutral:** because discovery keys off the built assembly + config
  globs (not C# syntax), the same adapter serves the future **F#** facade
  ([ADR 0008](0008-dotnet-port.md)) with no changes — F# ships only a facade and
  `.steps.fs` fixtures, reusing this adapter.

## Consequences

### Positive

- Individual examples are first-class, independently selectable/reportable tests
  in `dotnet test`, VS/Rider/VS Code Test Explorer, and CI — parity with every
  other adapter — and framework-neutral (no xUnit/NUnit/MSTest dependency).
- "Add the package" is the whole integration story (`*.TestAdapter.dll`
  auto-load).
- One adapter covers both C# and F#.

### Negative / risks

- More upfront work than a `[Theory]` source: implementing `ITestDiscoverer`/
  `ITestExecutor`, a stable `TestCase` identity/`FullyQualifiedName` scheme, and
  correct `TestCase.Source`/`CodeFilePath` wiring. Budget it as its own
  sub-project task, and verify re-run-single-test round-trips (the VSTest analog
  of the `UniqueId` round-trip risk in ADR 0003).
- **MTP:** Microsoft.Testing.Platform is the future direction; a VSTest adapter
  runs under MTP's compatibility bridge today, but a native MTP entry point may
  be worth adding later. Out of scope for v1.
- Verify auto-load and `--filter` selection against a **real sample project**
  (`examples/csharp-*`), not just unit tests of the adapter.

## Alternatives considered

See Option B above — rejected for coupling Varar to a single assertion framework
and for weaker discovery-time visibility of individual examples, the property
that most differentiates Varar's adapters from a plain "scan files and assert"
test.

## References

- VSTest adapter SPI —
  `Microsoft.VisualStudio.TestPlatform.ObjectModel.Adapter.ITestDiscoverer` /
  `ITestExecutor`; the `*.TestAdapter.dll` auto-load + `[DefaultExecutorUri]` /
  `[FileExtension]` convention.
- [ADR 0003 — Java JUnit Platform `TestEngine`](0003-java-junit-integration.md)
  — the structurally identical decision on the JVM.
- [ADR 0002 — drift detection & acknowledgment](0002-drift-detection-and-acknowledgment.md).
- `doc/superpowers/specs/2026-07-19-dotnet-runner-adapter-design.md` — the
  concrete `Varar.Runner`/`Varar.TestAdapter` design this decision feeds.
