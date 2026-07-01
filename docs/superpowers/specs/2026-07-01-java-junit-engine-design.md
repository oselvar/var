# var-runner (Java) + var-junit engine (sub-project 2 of the Java port)

Date: 2026-07-01
Status: design, pending sub-project 1 (pure core)

Second sub-project of the Java port. Sub-project 1
([`2026-07-01-java-core-port-design.md`](2026-07-01-java-core-port-design.md)) lands the
pure `var-core`/`var` and must pass full conformance parity before this sub-project
starts — same sequencing Python used (pure core first, pytest plugin second). This
sub-project adds a shared **`var-runner`** (imperative shell: discovery, config,
running a spec) and the ergonomic **`var-junit`** JUnit Platform `TestEngine`, whose
integration approach was decided in [ADR 0003](../../adr/0003-java-junit-integration.md)
after evaluating `cucumber-junit-platform-engine` as prior art.

## Why this scope

ADR 0001 names the runtime/test-runner adapter as the per-language seam. ADR 0003 names
*how* Java fills that seam: a custom JUnit Platform `TestEngine`, not a Jupiter
`@TestFactory`/dynamic-test shortcut, because only a real `TestEngine` gives
discovery-time-visible, independently selectable per-example tests — parity with
`var-vitest` and `var-pytest`.

## Architecture — packages

```
var          # pure core (sub-project 1, done): parse → plan → execute, defineState, diffs, toFailure
var-runner   # NEW shared imperative shell: discovery + step loading + runSpec → results
var-junit    # NEW: JUnit Platform TestEngine (id "var"), descriptor tree, config, rendering
```

- **`var-runner`** (`com.oselvar.var.runner`) depends only on `var`. It is the only
  place that touches the filesystem/classpath and loads step-definition classes. Exposes
  (naming mirrors Python's `var_runner` module, translated to Java method/class
  conventions):
  - `Registry loadSteps(List<String> stepClassNames or step globs, ClassLoader)` —
    reflectively load/initialize each step-definition class (registration happens via
    static initializers or an explicit registration call, depending on what sub-project
    1's Author API task settles on), build and return the immutable `Registry`.
  - `List<Path> findSpecs(List<String> include, List<String> exclude, Path root)` —
    glob discovery over `.md` files, same include/exclude semantics as `var.config.ts`/
    `[tool.var]`.
  - `SpecRun runSpec(Path path, String source, Registry registry, Supplier<State>
    contextFactory)` — parse → plan → `collectExamples`, exposing each `PlannedExample`
    (name, span) as a runnable unit so `var-junit` creates one descriptor per example
    and drives execution, capturing the raised diff/`toFailure` result as a structured,
    span-anchored failure. Exact decomposition (return per-example `Runnable`s vs. a
    `runOne(example, ports)` the engine calls) — lean toward the latter, same as
    Python's design leaned, so the caller (the JUnit engine) controls timing.
  - `VarConfig readVarConfig(...)` — parses the Java config surface (below).

- **`var-junit`** (`com.oselvar.var.junit`, artifact `var-junit`) depends on
  `var-runner` + `junit-platform-engine`. Ships the engine class registered via
  `META-INF/services/org.junit.platform.engine.TestEngine`; installing the dependency is
  the whole setup (matches `var-pytest`'s `pytest11` entry-point ergonomics — see the
  Python design's "Why this scope"). Contains only JUnit-Platform glue; no pipeline
  logic (delegates to `var-runner`/`var`).

## Config & discovery

No `[tool.var]`/`var.config.ts` equivalent file exists yet for Java — JUnit Platform's
own `ConfigurationParameters` mechanism is the idiomatic surface (this is what
`cucumber-junit-platform-engine`'s `Constants`/`CucumberConfiguration` use). **Verified
empirically (Task 12, `ConfigPrecedenceTest`) against the real
`org.junit.platform.launcher.core.LauncherConfigurationParameters` (6.1.1 sources) —
correcting this section's original stated assumption:** there is no environment-variable
tier at all; `ConfigurationParameters#get`'s own javadoc says so explicitly ("an attempt
will be made to look up the value as a JVM system property. If no such system property
exists, an attempt will be made to look up the value in the `junit-platform.properties`
file" — no mention of environment variables). The real precedence, first match wins, is:
explicit configuration parameters (e.g. passed via a `LauncherDiscoveryRequestBuilder` or
an IDE/build-tool integration) → explicitly-added configuration-parameter classpath
resources → a parent `ConfigurationParameters` (nested `Launcher`) → **JVM system
property** → **`junit-platform.properties` classpath file**. For the two tiers a `var-junit`
user actually sets by hand — a system property vs. the `junit-platform.properties`
file — **system property wins**. Mirror the same three config keys every other adapter
has:

```properties
# junit-platform.properties (classpath root)
var.vars.include=features/**/*.md
var.vars.exclude=**/wip/**
var.steps=com.example.steps
```

- `var.vars.include`/`var.vars.exclude` — comma-separated glob lists, identical
  include/exclude semantics to `var.config.ts`/`[tool.var]`. No default include (empty
  discovers nothing); exclude removes matches.
- `var.steps` — comma-or-newline-separated package names (or FQCNs) to scan for
  step-definition classes, since Java has no natural "glob over source files" the way
  Python/TS do (compiled classes, not source paths, are what's on the classpath at test
  time) — resolve via the classpath scan the discovery selectors already give you
  (`PackageSelector`), not a second, separate file-glob mechanism.
- **No special file extension.** A `.md` classpath resource is a spec iff it matches the
  `var.vars` globs — same rule as every other language, stated in CLAUDE.md.

**Spec identification via discovery selectors**, not a `pytest_collect_file`-style hook
(JUnit Platform has no direct equivalent): `VarTestEngine.discover(...)` resolves the
platform-standard selectors —`ClasspathRootSelector`, `PackageSelector`,
`ClasspathResourceSelector`, `FileSelector`, `DirectorySelector`, `UniqueIdSelector` —
into a descriptor tree by scanning for `.md` resources matching `var.vars.include`
minus `var.vars.exclude`. Port `cucumber-junit-platform-engine`'s
`DiscoverySelectorResolver`/`FeaturesPropertyResolver` shape (resolve each selector kind
into candidate resources, then filter by config), adapted from Cucumber's
`glue`/`features` properties to `var`'s `vars`/`steps`.

## Descriptor tree → one container per file, one leaf per example

```
com.example.CalculatorSpec > adds two numbers        PASSED
com.example.CalculatorSpec > divides by zero          FAILED
```

var has no scenario-outline/rule/examples nesting like Gherkin — the tree is flatter
than `cucumber-junit-platform-engine`'s: **engine → one container per spec file → one
leaf per `PlannedExample`.**

- `VarEngineDescriptor` (root, `EngineDescriptor` + `Node<VarEngineExecutionContext>`,
  mirrors `CucumberEngineDescriptor`): `getId() = "var"`; children only run work if
  `!getChildren().isEmpty()` (same guard `CucumberEngineDescriptor.ifChildren` uses, to
  avoid running when the Suite Engine causes multiple discovery passes).
- `VarFileDescriptor` (container, `Type.CONTAINER`): one per discovered `.md` resource;
  `UniqueId` segment type `"spec"`, value = the resource's relative path (mirrors
  Cucumber's `"feature"` segment keyed by URI).
- `VarExampleDescriptor` (leaf, `Type.TEST`, implements `Node<VarEngineExecutionContext>`):
  one per `PlannedExample`; `UniqueId` segment type `"example"`, value = a stable key
  (line number, like Cucumber's `Location`-based segments — **not** the example's display
  name, which can collide or change; the `UniqueId` must be stable across runs for
  `UniqueIdSelector` re-run-single-test to work — flag as a task-plan risk).
  `getSource()` returns a `FileSource`/`FilePosition` pointing at the example's span
  start line, so IDEs jump to the `.md` line, not adapter internals.
  `execute(context, dynamicTestExecutor)` calls `var-runner`'s `runOne(example, ports)`
  and returns/throws per pass/fail — mirrors `PickleDescriptor.execute`.

## Failure rendering

Reuse the core's `toFailure`/diff payloads (`CellMismatchError`,
`DocStringMismatchError`, `ReturnShapeError`, `UnexpectedPassError`) exactly as
`var-pytest` does — render span-anchored expected/actual against the `.md` source, never
re-derive failure text in the engine. An assertion-style Java exception (or a dedicated
`VarAssertionError`) carrying the structured diff is what `execute()` throws; JUnit
Platform's existing `TestExecutionResult.failed(throwable)` reporting picks it up with
no special engine-side rendering beyond building a good `getMessage()`.

## Testing

- **Engine behavior via `junit-platform-testkit`** (`EngineTestKit`), the direct
  equivalent of `pytester`/Python's `pytester`-based plugin tests and exactly what
  `CucumberTestEngineTest` uses: run the engine against a small in-memory/temp-directory
  fixture (a `.md` spec + a step class on the test classpath) and assert on the emitted
  `Events` — per-example pass/fail counts, `UniqueId` selection, the markdown-anchored
  failure message, `var.vars` include/exclude behavior.
- **`var-runner` unit tests:** discovery (glob include/exclude), step loading/reset,
  config parsing, `runSpec` producing correct per-example results including a
  structured span-anchored failure — same coverage list as Python's `var-runner` tests.
- **Dogfood/integration:** run `conformance/bundles/*` through the engine via
  `EngineTestKit` and assert pass/fail matches each bundle's `trace.json` (same
  cross-check Python's pytest plugin does against the conformance-proven core).
- All green from `java/`: `mvn test` (or the equivalent Maven Surefire invocation scoped
  to the new modules).

## Risks / notes

- **`UniqueId` stability** — must not be derived from anything that changes without the
  example actually changing (e.g. not the example's display name, which is derived from
  Markdown text and can be edited without moving the example) — use span/line-based
  keys, per `cucumber-junit-platform-engine`'s `Location`-based segment values.
- **Maven/Gradle auto-discovery of a non-Jupiter engine** — verify empirically against a
  real sample project early in the task plan (both build tools *should* pick up any
  `TestEngine` on the test classpath automatically via the Platform launcher, same as
  `cucumber-junit-platform-engine` users experience, but this needs a real end-to-end
  smoke test, not an assumption carried over from reading Cucumber's docs).
- **Config precedence** — **RESOLVED (Task 12).** Confirmed empirically
  (`ConfigPrecedenceTest`) against the real `LauncherConfigurationParameters`: there is no
  environment-variable tier — system property beats the `junit-platform.properties` file,
  full order in "Config & discovery" above. The original assumption (system property →
  environment variable → file) was wrong about the middle tier; corrected above so
  `var.vars` behavior in CI matches what's documented, not a carried-over guess from
  Cucumber's docs.
- **Author-API dependency** — this sub-project's step-loading mechanism depends directly
  on however sub-project 1's Task 1 resolves the author-API registration shape (static
  initializer vs. explicit call vs. annotation-driven) — do not start `var-runner`'s
  `loadSteps` until that's settled and stable.

## Open questions (resolve at implementation start)

- Whether `var-runner` or `var-junit` owns building the `PlannedExample → Node` mapping
  — lean toward `var-junit` owning it (it's JUnit-Platform-specific, needs `UniqueId`/
  `TestSource`), `var-runner` exposing the planned examples + a `runOne` seam, same
  division Python's design reached for the pytest fixture bridge.
- Whether a fixture/DI bridge (parallel to `var-pytest`'s `getfixturevalue` bridge) is
  wanted for v1 — JUnit Jupiter's own `ParameterResolver` mechanism doesn't naturally
  extend to a non-Jupiter `TestEngine`; if wanted, this needs its own design, not a
  direct translation of Python's approach. Treat as an explicit **defer** unless there's
  a concrete first use case.
- Async/virtual-thread execution — if step handlers should support Java's structured
  concurrency or virtual threads, confirm whether `HierarchicalTestEngine`'s executor
  service needs a custom `HierarchicalTestExecutorService`, mirroring
  `CucumberTestEngine.createExecutorService`.

## References

- [ADR 0003 — Java JUnit integration](../../adr/0003-java-junit-integration.md) — the
  decision this design implements.
- `cucumber-junit-platform-engine` (cloned for reference) —
  `CucumberTestEngine`, `CucumberEngineDescriptor`, `CucumberTestDescriptor`,
  `DiscoverySelectorResolver`, `META-INF/services/org.junit.platform.engine.TestEngine`.
- Python precedent: [`2026-06-30-var-pytest-plugin-design.md`](2026-06-30-var-pytest-plugin-design.md).
- Core surfaces (once sub-project 1 lands):
  `java/var/src/main/java/com/oselvar/var/*.java`.
- TS reference adapter (shape only): `typescript/packages/var-vitest`.
