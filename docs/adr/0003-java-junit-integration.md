# ADR 0003 — Java JUnit integration via a custom JUnit Platform `TestEngine`

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Aslak Hellesøy
- **Tags:** java, junit, test-runner-adapter, cross-language

## Context

Java is the third language port (after TypeScript and Python), per
[ADR 0001](0001-second-language-python.md) and the
[`adding-a-language-port`](../../.claude/skills/adding-a-language-port/SKILL.md) skill.
Each existing test-framework adapter (`var-vitest`, `var-pytest`) gives **one
independently selectable/reportable test per Markdown example**, with failures
rendered anchored to the `.md` source span. The Java adapter (package `var-junit`,
Java package `com.oselvar.var.junit`) must give the same guarantee against JUnit.

"Latest JUnit system" means the **JUnit Platform** (the launcher infrastructure IDEs,
Maven Surefire/Failsafe, and Gradle all speak), not just JUnit Jupiter (the `@Test`
annotation-based programming model that ships with it). The Platform supports multiple
**engines** side by side — Jupiter is one engine; `cucumber-junit-platform-engine` is
another. This ADR is about which integration point on the Platform `var-junit` should
use.

We evaluated `cucumber-jvm`'s own integration history (cloned locally at implementation
time for reference: `cucumber-junit-platform-engine`) as the closest prior art — a
Markdown-example-per-test problem shaped almost identically to Cucumber's
feature/scenario-per-test problem.

### Options considered

**A. Custom `TestEngine`** (what `cucumber-junit-platform-engine` does today, and what
superseded Cucumber's older JUnit4 `@RunWith(Cucumber.class)` runner and a
Jupiter-extension prototype). Implement `org.junit.platform.engine.TestEngine`,
typically by extending the support class
`org.junit.platform.engine.support.hierarchical.HierarchicalTestEngine<Context>`, and
register it via `META-INF/services/org.junit.platform.engine.TestEngine`
(`ServiceLoader`). The engine owns:
- **Discovery** (`discover(EngineDiscoveryRequest, UniqueId)`): resolves the platform's
  standard selectors (classpath root, package, file, directory, unique-id, URI) into a
  `TestDescriptor` tree, built **before** any test runs.
- **The descriptor tree**: one container node per spec file, one leaf `Node<Context>`
  per example — each independently addressable by `UniqueId`, so IDEs/Maven/Gradle can
  select, filter, and report on individual examples exactly like they do individual
  `@Test` methods.
- **Execution**: `HierarchicalTestEngine` schedules the tree for you (including
  parallelism if wanted); each leaf's `execute()` calls into `var-runner`.

**B. Jupiter `@TestFactory` dynamic tests.** Ship a JUnit Jupiter extension/base class
where a user (or a generated test class) has one `@TestFactory` method that scans
`.md` specs and returns a `Stream<DynamicNode>` (`DynamicContainer`/`DynamicTest`) — one
`DynamicTest` per example. Runs on the stock Jupiter engine everyone already has; no
custom `TestEngine`, no discovery SPI to implement.

**C. Jupiter `TestTemplateInvocationContextProvider`** (the mechanism behind
parameterized tests). Similar shape and same caveat as B, just a different Jupiter
extension point.

### Why not B/C

Dynamic tests and template invocation contexts are generated at **execution time**,
inside the factory/provider method — not at **discovery time**. That means:
- The Platform (and therefore IDEs, Maven/Gradle "run single test", `-Dtest=`) cannot
  see or select an individual example until the containing factory method has already
  started running. You lose "one independently selectable test per example" — the core
  requirement every other adapter (`var-vitest`, `var-pytest`) already provides.
- Test reports show the dynamic tests as children of the factory method, which is
  workable but a materially weaker IDE/CI experience than first-class discovered tests.

This is exactly the limitation Cucumber hit with its own earlier integrations, and why
`cucumber-junit-platform-engine` — a real `TestEngine` — is what Cucumber ships and
recommends today. Options B/C are simpler to build but demonstrably the wrong shape for
this project's cross-language adapter contract.

## Decision

**`var-junit` implements a custom JUnit Platform `TestEngine`**, modeled on
`cucumber-junit-platform-engine`'s architecture:

- Extend `HierarchicalTestEngine<VarEngineExecutionContext>`; register via
  `META-INF/services/org.junit.platform.engine.TestEngine` so installing the dependency
  is the entire setup (matches `var-pytest`'s `pytest11` entry-point ergonomics —
  "add the dependency" is the whole integration story, no user wiring).
- Engine id: `"var"`.
- Descriptor tree: `VarEngineDescriptor` (root) → one container per discovered spec file
  → one leaf per `PlannedExample` (flat — var has no scenario-outline/rule nesting like
  Gherkin, so the tree is shallower than Cucumber's).
- Discovery selectors to support at minimum: `ClasspathRootSelector`,
  `PackageSelector` (resources on the classpath matching the configured globs),
  `FileSelector`, `DirectorySelector`, `UniqueIdSelector` — mirrors what
  `cucumber-junit-platform-engine`'s `DiscoverySelectorResolver` supports, adapted to
  `var`'s glob-based `vars`/`steps` config instead of Cucumber's `glue`/`features`
  properties.
- Leaf execution delegates to `var-runner` (`run_spec`/`plan_spec` equivalents), reusing
  the pure core's diffs/`to_failure` for span-anchored failure messages — same contract
  as every other adapter.
- Config surface: a `var.properties`-style JUnit Platform configuration parameter block
  (`var.vars.include`, `var.vars.exclude`, `var.steps`), resolved the same way Cucumber
  resolves `cucumber.*` configuration parameters (JVM system property → environment
  variable → `junit-platform.properties` on the classpath) — do **not** invent a
  fourth config mechanism; reuse the Platform's own `ConfigurationParameters` lookup
  chain so it composes with however the consumer already configures JUnit.

## Consequences

### Positive

- Individual examples are first-class, independently selectable/reportable tests in
  IntelliJ/Eclipse/VS Code, Maven Surefire/Failsafe, and Gradle — parity with
  `var-vitest`/`var-pytest`.
- No required user wiring beyond adding the `var-junit` dependency (ServiceLoader
  discovery), matching the ergonomics goal from the Python `var-pytest` design.
- `HierarchicalTestEngine` gives parallel execution and proper `ExclusiveResource`
  support for free if ever needed, without hand-rolling a scheduler.

### Negative / risks

- More upfront implementation than a `@TestFactory` (a real `TestDescriptor` tree,
  discovery-selector resolution, `UniqueId` scheme) — budget real time for it; treat it
  as its own sub-project task plan, not a quick add-on to the core port.
- Maven **and** Gradle both need the Platform launcher wired to discover
  non-Jupiter engines; this is standard (Surefire/Gradle both do it automatically once
  the engine JAR is on the test classpath, exactly as `cucumber-junit-platform-engine`
  users experience it) but should be verified with a real sample project, not assumed.
- `UniqueId`/`TestSource` construction has subtle correctness requirements (must be
  stable across runs, must round-trip through `UniqueIdSelector` for re-run-single-test
  to work) — a documented risk in Cucumber's own engine; test this explicitly.

## Alternatives considered

See Options B/C above — rejected for losing discovery-time visibility of individual
examples, the one property that most differentiates `var`'s adapters from a plain
"scan files and assert" test.

## References

- `cucumber-junit-platform-engine` (cloned locally for reference during design; see
  `io.cucumber.junit.platform.engine.CucumberTestEngine`,
  `CucumberEngineDescriptor`, `CucumberTestDescriptor`,
  `DiscoverySelectorResolver`) — https://github.com/cucumber/cucumber-jvm
- JUnit Platform `TestEngine` SPI —
  `org.junit.platform.engine.TestEngine`,
  `org.junit.platform.engine.support.hierarchical.HierarchicalTestEngine`
- [ADR 0001 — second language (Python)](0001-second-language-python.md) — the
  per-language seam this ADR fills in for Java's runtime/test-runner adapter.
- `docs/superpowers/specs/2026-07-01-java-junit-engine-design.md` — the concrete
  `var-runner`/`var-junit` design this decision feeds.
