# var-runner (Java) + var-junit engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared `var-runner` (imperative shell: config, discovery, step loading, run
orchestration, failure rendering) plus an ergonomic `var-junit` — a custom JUnit
Platform `TestEngine` (per [ADR 0003](../../adr/0003-java-junit-integration.md)) that
turns `.md` specs into first-class, individually-selectable JUnit tests — proven end to
end by running all 12 `conformance/bundles/*` through it and matching each bundle's
`golden/trace.json` pass/fail outcome.

**Architecture:** Three layers, mirroring the Python precedent
([`2026-06-30-var-pytest-plugin.md`](2026-06-30-var-pytest-plugin.md)) and this
sub-project's own design doc
([`2026-07-01-java-junit-engine-design.md`](../specs/2026-07-01-java-junit-engine-design.md)):
`var` (pure core + facade, done, conformance-complete) → `var-runner`
(`com.oselvar.var.runner`, depends only on `var` — the only place doing
filesystem/classpath I/O) → `var-junit` (`com.oselvar.var.junit`, depends on
`var-runner` + `junit-platform-engine` — the only place with JUnit-Platform types).
Tasks 1–6 build `var-runner`; Tasks 7–14 build `var-junit`; Task 15 is the final
workspace check.

**Tech stack:** Java 21, Maven, **JUnit 6.1.1** (`junit-bom`; confirmed the actual
current release directly against `repo1.maven.org` — see `java/pom.xml`'s comment;
requires Java 17+, already satisfied). Depends on the in-repo `com.oselvar:var`.

## Global constraints

- **Hexagonal.** `var-core`/`var` stay untouched — this plan adds ONLY new modules. All
  filesystem/classpath access lives in `var-runner`/`var-junit`. **`var-runner` must
  have zero `org.junit.platform.*` imports** — verify with `grep` before each
  `var-runner` task's commit, the same discipline the core plan used for `var-core`
  never importing `var`'s facade types.
- **No `.md`-extension convention beyond what's already established.** A `.md`
  classpath resource is a spec iff its path matches the `var.vars` include/exclude
  globs (same semantics as `var.config.ts`/`[tool.var]`): `include` has no default
  (empty discovers nothing), `exclude` removes matches, plain globs (no `!` prefix).
- **One JUnit test per example**, independently selectable via `UniqueId`
  (`-Dtest=`/IDE "run single test"/`--select-unique-id`), reported at the `.md`
  example's source line via `FileSource`.
- **`var-junit` is the ONLY place with a fixture/DI bridge decision to make** (deferred
  per the design doc unless a concrete need arises — do not build one speculatively in
  this plan).
- **Markdown-anchored failures:** render `var-core`'s diff exceptions
  (`CellMismatchException`/`DocStringMismatchException`/`ReturnShapeException`) and
  `Execute.UnexpectedPassException` against the `.md` source, reusing
  `Failure.toFailure`'s structured `Result.ExampleFailure` payload — never re-derive
  failure text from scratch in the engine.
- **Immutable data** (records, `List.copyOf`) — established project-wide rule.
- **Each task ends green** from `java/`: `mvn -f pom.xml clean test` (use `clean`, not
  bare `test` — a stale-incremental-build false signal came up during the core port).
  Commit per task.
- Artifact names: `var-runner` (package `com.oselvar.var.runner`), `var-junit`
  (package `com.oselvar.var.junit`).

---

## Core surfaces this plan binds to (verified against the actual committed code, not
assumed from the design doc)

- `com.oselvar.var.core.Plan.plan(Ast.VarDoc doc, Registry registry) -> Plan.ExecutionPlan`
  (`.examples(): List<PlannedExample>`, `.diagnostics()`). `PlannedExample` has
  `.name()`, `.span()` (`Span.startLine()`).
- `com.oselvar.var.core.Parse.parse(String path, String source) -> Ast.VarDoc`.
- `com.oselvar.var.core.Execute`: `Execute.Reporter` (interface), `Execute.ExecutionObserver`
  (`void step(StepObservation o)`), `Execute.StepObservation(int exampleIndex, int
  ordinal, String outcome, Throwable error)`, `Execute.ExecutePorts(Reporter reporter,
  Function<String,Object> createContext, ExecutionObserver observer)`,
  `Execute.QueuedExample(String name, Runnable run)`,
  `Execute.collectExamples(Plan.ExecutionPlan plan, ExecutePorts ports) ->
  List<QueuedExample>` (preserves `plan.examples()` order — `run()` is a synchronous
  `Runnable` that internally drives any async handlers and throws on failure),
  `Execute.executePlan(...)` (not needed by this plan — `var-runner` uses
  `collectExamples` directly so the caller/JUnit engine controls per-item timing),
  `Execute.UnexpectedPassException`.
- Diff exceptions: `com.oselvar.var.core.CellDiff.CellMismatchException` (+
  `.cells(): List<CellDiff>`), `CellDiff.ReturnShapeException`;
  `com.oselvar.var.core.DocStringDiff.DocStringMismatchException` (+ `.diff():
  DocStringDiff`). `com.oselvar.var.core.Failure.toFailure(Throwable error, String
  specPath, int fallbackLine) -> Result.ExampleFailure` — this already does the
  exception-type dispatch + stack-frame-based line extraction; `var-runner`'s render
  function is a thin formatter over its output, not a second dispatch.
- Facade / registration: `com.oselvar.var.StepDefinitions` (`void defineSteps(Registrar
  r)`), `com.oselvar.var.Registrar` (`<C extends State> StateBinder<C>
  defineState(Supplier<C> factory)`, `<T> void defineParameterType(String name, Pattern
  regexp, Function<String[],T> transformer)`), `com.oselvar.var.RegistryRegistrar`
  (implements `Registrar`; `.registry(): Registry` and `.stateFactory():
  Supplier<? extends State>` accessors, populated once `defineSteps` returns — a fresh
  instance per run, no global accumulator, per Task 11's decision).
- `com.oselvar.var.core.Registry` — passed straight through from `RegistryRegistrar` to
  `Plan.plan`.

---

## File Structure

`java/var-runner/`:
- `pom.xml` (artifact `var-runner`, depends on `var` only — no `junit-platform-*`)
- `src/main/java/com/oselvar/var/runner/{VarConfig,Discovery,StepLoader,Run,Render}.java`
- `src/test/java/com/oselvar/var/runner/*Test.java`

`java/var-junit/`:
- `pom.xml` (artifact `var-junit`, depends on `var-runner` + `junit-platform-engine`;
  test-scoped `junit-platform-testkit` + **explicit `junit-jupiter`** — see Task 7's
  note on why the explicit Jupiter test dependency is required, not optional)
- `src/main/resources/META-INF/services/org.junit.platform.engine.TestEngine`
- `src/main/java/com/oselvar/var/junit/{VarTestEngine,VarEngineDescriptor,
  VarFileDescriptor,VarExampleDescriptor,VarEngineExecutionContext,
  DiscoverySelectorResolver,ConfigBridge}.java`
- `src/test/java/com/oselvar/var/junit/*Test.java`

Modify `java/pom.xml`: add `<module>var-runner</module>` and `<module>var-junit</module>`;
add `junit-platform-engine`/`junit-platform-testkit` to `dependencyManagement` (already
covered transitively by the `junit-bom` import at 6.1.1 — confirm no extra version
property is needed).

---

## Task 1: Scaffold `var-runner` + `var-junit` Maven modules

**Files:**
- Modify: `java/pom.xml` (add both modules to `<modules>`)
- Create: `java/var-runner/pom.xml` (depends on `var`), skeleton `package-info.java` +
  `SmokeTest.java`
- Create: `java/var-junit/pom.xml` (depends on `var-runner` + `junit-platform-engine`;
  test-scoped `junit-platform-testkit` + `junit-jupiter`), skeleton `package-info.java`
  + `SmokeTest.java`

**Interfaces:** after this task, `mvn -f java/pom.xml clean test` succeeds with four
green modules (`var-core`, `var`, `var-runner`, `var-junit`), each with a trivial smoke
test.

- [x] **Step 1:** Added both modules to `java/pom.xml`'s `<modules>` list.
- [x] **Step 2:** Wrote `java/var-runner/pom.xml` — depends on `com.oselvar:var`
  only. No `junit-platform-*` dependency.
- [x] **Step 3:** Wrote `java/var-junit/pom.xml` — depends on `com.oselvar:var-runner`
  + `org.junit.platform:junit-platform-engine`; test-scoped
  `junit-platform-testkit` + explicit `junit-jupiter` (with the Surefire-detection
  rationale recorded in the POM comment).
- [x] **Step 4:** One trivial smoke test per new module.
- [x] **Step 5:** Run → PASS. `mvn -f java/pom.xml clean test` — 6 modules, all
  green (`var-core`, `var`, `var-runner`, `var-junit` + parent).
- [x] **Also corrected mid-task (real, not hypothetical):** `java/pom.xml`'s
  `junit.version` was still pinned to `5.11.4` from the core-port plan. Queried
  `repo1.maven.org` directly (not the previously-stale `search.maven.org` index):
  **JUnit 6.1.1** is the actual current `<latest>`/`<release>` for
  `junit-bom`/`junit-jupiter`/`junit-platform-engine`, unifying Platform+Jupiter+
  Vintage under one version stream, requiring Java 17+ (already satisfied at 21).
  Bumped the pin; verified as a drop-in upgrade (`mvn clean test` still 41/41 green
  on `var-core`+`var` before adding the new modules). This directly serves the
  "latest JUnit system" goal ADR 0003 was written for.
- [ ] **Step 6: Commit** — `feat(java): scaffold var-runner + var-junit Maven modules`

---

## Task 2: `var-runner` — `VarConfig` (no JUnit dependency)

**Files:** Create `VarConfig.java`, `VarConfigTest.java`.

**Interfaces (Produces):** `record VarConfig(List<String> varsInclude, List<String>
varsExclude, List<String> steps)` (defensive `List.copyOf`); `static VarConfig
fromLookup(Function<String, Optional<String>> lookup)` — reads three keys
(`var.vars.include`, `var.vars.exclude`, `var.steps`) via the supplied lookup function,
splitting each on comma (matching the design doc's `properties`-file convention),
trimming whitespace, dropping empty entries. **Do not depend on
`org.junit.platform.engine.ConfigurationParameters` here** — that type belongs to
`var-junit`; this function takes a plain `Function<String, Optional<String>>` so
`var-junit` can adapt `ConfigurationParameters::get` to it without `var-runner` ever
importing a JUnit-Platform type. (This is the resolution to the design doc's own
tension: it lists `readVarConfig` as a `var-runner` responsibility but names
`ConfigurationParameters` as the config surface — the split above keeps both true
without violating the hexagonal boundary.)

- [ ] **Step 1: Failing test** — a lookup returning `include`/`exclude`/`steps` as
  comma-separated strings; assert the parsed lists; a lookup returning
  `Optional.empty()` for all keys → all three lists empty (no default include).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-runner VarConfig (lookup-based, no JUnit dependency)`

---

## Task 3: `var-runner` — spec discovery

**Files:** Create `Discovery.java`, `DiscoveryTest.java`.

**Interfaces (Produces):** `static boolean matchSpec(Path path, List<String> include,
List<String> exclude, Path root)` — true iff `path` (relative-POSIX'd against `root`)
matches an include glob and no exclude glob; `static List<Path> findSpecs(List<String>
include, List<String> exclude, Path root)` — every file under `root` matching an
include glob minus excludes, sorted.

**Portability note:** this is the SAME glob-matching problem `python/packages/var-runner/src/var_runner/discovery.py`
already solved (translate/adapt its `**`-handling regex-compilation approach — read it
first, it has detailed comments on `/**/`, leading `**/`, and bare `**` semantics — Java
has no built-in equivalent to Python 3.13's `Path.full_match`, so compile a regex the
same way Python's `_glob_to_regex` does). Do not reach for a glob library; this is a
small, fully-specified translation task, same category as `CanonicalJson`'s
hand-rolled-not-library decision in the core plan.

- [ ] **Step 1: Failing test** — translate `python/packages/var-runner/tests/test_discovery.py`'s
  cases (include-minus-exclude; a leading `**/` case; a `README.md` correctly excluded
  by not matching any include).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**, porting the glob→regex translation from
  `discovery.py`'s `_glob_to_regex`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-runner spec discovery (glob include/exclude)`

---

## Task 4: `var-runner` — step loading

**Files:** Create `StepLoader.java`, `StepLoaderTest.java`.

**Interfaces (Produces):** `record LoadedSteps(Registry registry, Supplier<? extends
State> contextFactory)` — wait, re-check: `RegistryRegistrar.stateFactory()` is
per-instance and only meaningful if exactly one `defineState` call happened on that
`Registrar`; if a step-definition class registers MULTIPLE state factories across
several `StepDefinitions` implementors (the common case — one per `.md`'s step file,
same as TS/Python's one-`defineState`-per-file rule), `var-runner` needs one
`RegistryRegistrar` **per `StepDefinitions` class**, not one shared across all of them
(a shared one would violate the "one state factory per step file" rule the design
inherited from TS/Python). Resolve this explicitly: `static Map<Class<? extends
StepDefinitions>, LoadedSteps> loadSteps(List<String> stepClassNames, ClassLoader
loader)` — reflectively `Class.forName(name, true, loader)`, verify it implements
`StepDefinitions`, instantiate via its no-arg constructor, call `defineSteps(new
RegistryRegistrar())`, and collect a `LoadedSteps` (that class's own `Registry` +
`contextFactory`) keyed by class. **Confirm this per-class keying against how
`Plan.plan`/`Execute` actually expect context factories to be looked up** — read
`Execute.ExecutePorts.createContext(): Function<String,Object>` (keyed by a `String`,
not a `Class`) and `Plan.PlannedStep`/`PlannedExample` for whatever "step file" key they
carry (this may be the `expressionSourceFile` on a `StepRegistration`, propagated
through matching/planning) — the actual lookup key `var-runner` must produce for
`ExecutePorts.createContext` has to match what `Execute` looks up by, not an
invented one; read the code, don't assume.

Also merge: since `Plan.plan` takes ONE `Registry` for a whole spec file, and a `.md`
file's steps could in principle come from step-definition classes registered via
different `StepDefinitions` implementors (matching TS's "load every step file that
matches the `steps` glob into one shared registry" model), `var-runner` needs a
merge step: `static Registry mergeRegistries(Collection<Registry> registries)` —
check whether `Registry`/`Registry.addStep` already supports appending
`StepRegistration`s from one registry into another, or if this needs new logic
(read `Registry.java` — if there's no existing merge helper, this is a legitimate
small addition to `var-runner`, not `var-core`, since `var-core`'s `Registry` is
already frozen behavior from the core-port plan; do not modify `var-core` in this
plan — build the merge in `var-runner` by iterating each registry's `steps()`/
`parameterTypes()` and re-adding them via `Registry.addStep`/`defineParameterType` into
one accumulator).

**Interfaces (Produces), revised:** `record LoadedSteps(Registry registry,
Function<String,Object> createContext)` where `createContext` looks up the right
per-file `stateFactory` by the SAME key `Execute` expects (confirmed above), falling
back sensibly (or throwing clearly) if a step file has no registered factory.

- [ ] **Step 1: Failing test** — two `StepDefinitions` test classes (mirroring two
  `.steps.ts` files in one bundle conceptually) each registering into their own
  `RegistryRegistrar`; `loadSteps` merges both into one `Registry` whose `steps()`
  contains both files' expressions; `createContext` resolves each file's own state
  factory correctly by key (not accidentally cross-wired to the other file's).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**, after confirming the `Execute`/`Plan` key convention by
  reading the actual core code (do not guess).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-runner step loading (per-class RegistryRegistrar, merged Registry)`

---

## Task 5: `var-runner` — run orchestration

**Files:** Create `Run.java`, `RunTest.java`.

**Interfaces (Produces):** `static Plan.ExecutionPlan planSpec(String path, String
source, Registry registry)` = `Plan.plan(Parse.parse(path, source), registry)`; `record
ExampleRun(Plan.PlannedExample example, Runnable run)`; `static List<ExampleRun>
examplesWithRuns(Plan.ExecutionPlan plan, Function<String,Object> createContext,
Execute.Reporter reporter)` — calls `Execute.collectExamples(plan, new
Execute.ExecutePorts(reporter, createContext, observer))` (an observer that's a no-op
unless a caller needs one — check whether `ExecutePorts.observer()` accepts `null` or
needs a no-op instance; read the record's usage in `Execute.java`) and zips the
resulting `List<QueuedExample>` with `plan.examples()` (same order, per the core
surfaces section above) into `(PlannedExample, Runnable)` pairs — mirrors Python's
`examples_with_runs` exactly.

- [ ] **Step 1: Failing test** — a passing example's `run()` doesn't throw; a failing
  example's `run()` throws (assert the specific exception type if practical, e.g.
  `CellDiff.CellMismatchException`, using a hand-built spec + `StepDefinitions` fixture
  in the test).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-runner run orchestration (planSpec + examplesWithRuns)`

---

## Task 6: `var-runner` — failure rendering

**Files:** Create `Render.java`, `RenderTest.java`.

**Interfaces (Produces):** `static String renderFailure(Throwable error, String
source, String path)` — a human-readable, markdown-anchored message, thin over
`Failure.toFailure(error, path, fallbackLine)`'s `Result.ExampleFailure` (confirm its
exact fields by reading `Result.java`): for a `cell-mismatch` failure, list each
failing cell's column/expected/actual + 1-based `.md` line; for `doc-string-mismatch`,
expected/actual + line; for `return-shape`/`unexpected-pass`, the failure's own
message; for any other `Throwable`, `"<ExceptionClassName>: <message>"`. **Do not
re-implement dispatch logic `Failure.toFailure` already does** — this function formats
an already-produced `Result.ExampleFailure` into text, it does not re-inspect the
`Throwable`'s type itself (that dispatch is `Failure.toFailure`'s job, already built
and unit-tested in the core plan's Task 17).

- [ ] **Step 1: Failing test** — construct a `Result.ExampleFailure` of each kind
  directly (or trigger real ones via a small planned/executed spec, whichever is
  easier given `Result`'s actual constructor shape) and assert the rendered text
  contains the right column/expected/actual/line; a plain `RuntimeException("boom")` →
  `"RuntimeException: boom"`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-runner failure rendering`. Update
  `var-runner`'s `package-info.java`/a re-export summary if the codebase convention
  wants one (check how `var-core`/`var` expose their public surface — probably no
  re-export needed, Java doesn't have JS/Python-style `__init__` re-exports; a
  package-level Javadoc summary is the idiomatic equivalent, optional).

---

## Task 7: `var-junit` — `TestEngine` skeleton + registration

**Files:**
- Create: `java/var-junit/src/main/resources/META-INF/services/org.junit.platform.engine.TestEngine`
  (content: `com.oselvar.var.junit.VarTestEngine`)
- Create: `VarTestEngine.java`, `VarEngineDescriptor.java`, `VarEngineExecutionContext.java`
- Create: `VarTestEngineTest.java` (uses `EngineTestKit`)

**Interfaces (Produces):** `public final class VarTestEngine extends
HierarchicalTestEngine<VarEngineExecutionContext> implements TestEngine` — `getId() ->
"var"`; `discover(EngineDiscoveryRequest, UniqueId) -> TestDescriptor` — for THIS task,
return an EMPTY `VarEngineDescriptor` (no children yet — discovery logic is Tasks 9–10);
`createExecutionContext(ExecutionRequest) -> VarEngineExecutionContext` (an empty
record/class for now, grown in later tasks as execution needs state). `VarEngineDescriptor`
(root, `EngineDescriptor` + `Node<VarEngineExecutionContext>`): mirrors
`CucumberEngineDescriptor`'s `ifChildren` guard (`prepare`/`before`/`after`/`cleanUp`
all no-op unless `!getChildren().isEmpty()`) — port this now even though there are no
children yet, so later tasks don't have to retrofit it.

**Portability note:** `cucumber-junit-platform-engine` (cloned during this port's
design phase; see ADR 0003's references) is the concrete model —
`CucumberTestEngine.java`, `CucumberEngineDescriptor.java` are the two files to mirror
structurally. Read them again now if not fresh from ADR 0003's research.

- [ ] **Step 1: Write the `EngineTestKit` smoke test** — `EngineTestKit.engine("var").execute()`
  should succeed (discover an empty tree, execute nothing) without throwing, and
  `EngineTestKit`'s events should show the engine container itself as
  skipped/successful with zero children — confirm the exact expected event shape by
  running it and reading `EngineTestKit`'s Javadoc/source rather than guessing.
- [ ] **Step 2: Run → FAIL** (engine class doesn't exist / not registered).
- [ ] **Step 3: Implement** the skeleton + `META-INF/services` file.
- [ ] **Step 4: Run → PASS.** Also confirm (per the design doc's flagged risk) that
  Maven Surefire picks up `VarTestEngine` automatically once it's on the test
  classpath — this smoke test running via `mvn test` (not just an IDE run) at all IS
  that confirmation; if it silently doesn't run, investigate before proceeding (this
  is the empirical verification the design doc calls for, not an assumption to carry
  forward).
- [ ] **Step 5: Commit** — `feat(java): var-junit TestEngine skeleton (empty discovery, registered via ServiceLoader)`

---

## Task 8: `var-junit` — config bridge

**Files:** Create `ConfigBridge.java`, `ConfigBridgeTest.java`.

**Interfaces (Produces):** `static VarConfig fromConfigurationParameters(ConfigurationParameters
params)` — adapts `params::get` (returns `Optional<String>`) into the
`Function<String,Optional<String>>` shape `VarConfig.fromLookup` (Task 2) expects, so
`var-runner`'s `VarConfig` stays JUnit-agnostic while `var-junit` supplies the real
JUnit-Platform-backed lookup. This is the ONLY new file in this task — it's a thin
adapter, not a reimplementation of `VarConfig`'s parsing logic.

- [ ] **Step 1: Failing test** — a fake/real `ConfigurationParameters` (JUnit Platform
  ships a `MapConfigurationParameters` test double in some versions — check what
  `junit-platform-testkit`/`junit-platform-engine`'s test-jar exposes, or hand-roll a
  minimal implementation of the interface) returning known values for
  `var.vars.include`/`var.vars.exclude`/`var.steps`; assert the resulting `VarConfig`
  matches.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-junit config bridge (ConfigurationParameters -> VarConfig)`

---

## Task 9: `var-junit` — discovery selector resolution (containers only)

**Files:** Create `DiscoverySelectorResolver.java`, `VarFileDescriptor.java`; test
`DiscoverySelectorResolverTest.java`.

**Interfaces (Produces):** `static void resolveSelectors(EngineDiscoveryRequest
request, VarEngineDescriptor engineDescriptor, VarConfig config)` — for each selector
kind the design doc names (`ClasspathRootSelector`, `PackageSelector`,
`ClasspathResourceSelector`, `FileSelector`, `DirectorySelector`, `UniqueIdSelector`),
resolve it into candidate classpath resources / files, filter to `.md` files matching
`config.varsInclude()`/`varsExclude()` (reuse `Discovery.matchSpec` from `var-runner` —
this is exactly why `var-runner`'s discovery logic had to be JUnit-agnostic: `var-junit`
calls it here), and for each surviving `.md` resource create ONE `VarFileDescriptor`
(container, `Type.CONTAINER`) as a child of `engineDescriptor` — do NOT yet create leaf
`VarExampleDescriptor`s (Task 10) or actually parse/plan the file's content in this
task; that's the next task. `VarFileDescriptor`'s `UniqueId` segment type is `"spec"`,
value = the resource's relative path (mirrors Cucumber's `"feature"` segment).

**Portability note:** port `cucumber-junit-platform-engine`'s
`DiscoverySelectorResolver`/`FeaturesPropertyResolver` SHAPE (resolve each selector kind
into candidate resources, then filter by config) — the concrete selector-resolution
calls (`ClasspathRootSelector.getClasspathRoot()`, `PackageSelector.getPackageName()` →
classpath scan, etc.) need their own investigation against the real
`junit-platform-engine` API surface (confirm via Javadoc/decompilation, same rigor as
the core port's `cucumber-expressions` investigations) — do not assume Cucumber's exact
method calls transfer unchanged.

- [ ] **Step 1: Failing test** — using `EngineTestKit.engine("var").selectors(...)`,
  select a `ClasspathRootSelector`/`PackageSelector` pointing at a small test-resource
  tree with 2 `.md` files (one matching `var.vars.include`, one excluded) and assert
  discovery produces exactly one container descriptor for the matching file.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**, wiring `VarTestEngine.discover` to call this resolver
  (using `ConfigBridge` from Task 8 to get the `VarConfig`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-junit discovery — one container per spec file`

---

## Task 10: `var-junit` — leaf descriptor tree (one per example)

**Note carried forward from Task 9's review:** until this task adds at least one
child per `VarFileDescriptor`, every discovered spec container is a childless,
non-root `Type.CONTAINER` — and JUnit Platform's `EngineDiscoveryOrchestrator` calls
`TestDescriptor.prune()` after discovery, which silently removes exactly that shape.
This means a real Surefire/IDE run *today* (before this task lands) discovers nothing
observable end-to-end, even though Task 9's resolver is correct — confirmed as an
expected, temporary state, not a defect (verified against `TestDescriptor.prune()`
and `EngineDiscoveryOrchestrator` in the real 6.1.1 sources during Task 9's review).
It resolves automatically once this task gives each container ≥1 leaf.

**Files:** Create `VarExampleDescriptor.java`; modify `VarFileDescriptor.java` (or
wherever discovery builds children) to add the planning step.

**Interfaces (Produces):** During discovery, for each `VarFileDescriptor`, read the
`.md` resource's content, call `var-runner`'s `Run.planSpec(path, source, registry)`
(the `registry` comes from `StepLoader.loadSteps` over `config.steps()` — confirm
whether step loading happens ONCE per engine discovery pass (session-scoped, like
Python's `pytest_configure`) or per file; **lean toward once per discovery pass**,
cached on `VarEngineDescriptor` or a context object, matching Python's design), then
create one `VarExampleDescriptor` (leaf, `Type.TEST`) per `PlannedExample`, as a child
of that file's `VarFileDescriptor`.

`VarExampleDescriptor`'s `UniqueId` segment type `"example"`, value = a **stable,
line-based key** (e.g. the example's `span().startLine()` as a string) — explicitly
**NOT** the example's display name (`PlannedExample.name()`), which is derived from
Markdown text and can change without the example itself moving; a `UniqueId` built
from the display name would break `UniqueIdSelector` re-run-single-test whenever an
author edits wording. This is a risk the design doc flagged explicitly — treat it as a
hard requirement, not a nice-to-have. `getSource()` returns a `FileSource`/`FilePosition`
at `span().startLine()` (1-based — confirm JUnit Platform's `FilePosition` line
numbering convention, don't assume it matches `Span`'s).

- [ ] **Step 1: Failing test** — a 2-example `.md` file discovers exactly 2 leaf
  descriptors, each with a `UniqueId` containing the correct line number and a
  `getSource()` pointing at the right line; select one leaf by its `UniqueId` via
  `EngineTestKit.engine("var").selectors(DiscoverySelectors.selectUniqueId(...))` and
  confirm only that one is discovered.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-junit leaf descriptors — one per PlannedExample, stable line-based UniqueId`

---

## Task 11: `var-junit` — execution

**Files:** Modify `VarExampleDescriptor.java` (implement `Node<VarEngineExecutionContext>.execute`).

**Interfaces:** `VarExampleDescriptor.execute(VarEngineExecutionContext context,
DynamicTestExecutor dynamicTestExecutor) -> VarEngineExecutionContext` — calls the
`Runnable` `var-runner`'s `Run.examplesWithRuns` produced for this example (retained
from Task 10's planning step — confirm whether to re-plan at execution time or retain
the `ExampleRun` from discovery; **retain it** — re-planning at execution time would
double-parse/plan every file and risks discovery-vs-execution inconsistency). On
success, return normally (JUnit Platform reports `SUCCESSFUL`). On the `Runnable`
throwing, wrap/rethrow so JUnit Platform's `TestExecutionResult.failed(throwable)`
picks it up with a good `getMessage()` — call `var-runner`'s `Render.renderFailure`
to build that message, attached to a thrown exception (either rethrow the original
with a rendered `getMessage()` via a wrapping exception, or check whether JUnit
Platform lets you report failure text without rethrowing — read `Node`'s contract).

- [ ] **Step 1: Failing test** — via `EngineTestKit`, a passing example reports
  `SUCCESSFUL`; a failing example (cell mismatch) reports `FAILED` with the rendered
  markdown-anchored message visible in the failure's `getMessage()`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(java): var-junit execution + markdown-anchored failure reporting`

---

## Task 12: `var-junit` — engine-level guard + config-precedence verification

**Files:** Modify `VarEngineDescriptor.java` if the Task 7 guard needs adjusting now
that there are real children; add `ConfigPrecedenceTest.java`.

- [ ] **Step 1:** Confirm `VarEngineDescriptor`'s `ifChildren` guard (Task 7) still
  behaves correctly now that discovery can produce real children — add a test with
  zero matching `.md` files confirming the engine does no work (mirrors
  `CucumberEngineDescriptor`'s rationale: avoid running when a Suite Engine causes
  multiple discovery passes).
- [ ] **Step 2:** Write a test EMPIRICALLY confirming
  `ConfigurationParameters`' precedence order (system property → environment variable →
  `junit-platform.properties` classpath file) — set a value at two levels
  simultaneously and confirm which wins, rather than trusting the design doc's stated
  assumption. If the actual precedence differs from what's documented, update the
  design doc's "Config & discovery" section to match reality.
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Commit** — `test(java): var-junit engine guard + config precedence verification`

---

## Task 13: `var-junit` — behavior tests via `EngineTestKit`

**Files:** Create `VarEngineBehaviorTest.java` (or extend existing test files).

**Interfaces:** Comprehensive `EngineTestKit`-driven coverage, mirroring Python's
`pytester`-based `var-pytest` test suite (Task 6 of the Python plan) and Cucumber's own
`CucumberTestEngineTest`: per-example pass/fail counts for a multi-example file;
`UniqueId` selection (re-running a single example); the markdown-anchored failure text
appearing in a failure event; `var.vars` include/exclude behavior (a non-matching `.md`
file is never discovered at all, not discovered-then-skipped).

- [ ] **Step 1: Write the tests** — if any of Tasks 7–12 already covered a case, don't
  duplicate it; this task's job is to fill gaps and give one comprehensive, readable
  test class future maintainers can scan.
- [ ] **Step 2: Run → PASS** (should already pass if Tasks 7–12 are solid — if
  something fails here, it means an earlier task's test coverage had a gap, not that
  new production code is needed; fix the responsible module, don't patch around it
  here).
- [ ] **Step 3: Commit** — `test(java): var-junit comprehensive EngineTestKit behavior coverage`

---

## Task 14: Dogfood — all 12 conformance bundles through the engine

**Files:** Create `ConformanceDogfoodTest.java` (in `var-junit`'s test sources —
NOT the language-neutral corpus itself, since this test is JUnit-Platform-specific,
unlike the core plan's `ConformanceTest`, which compared wire-format JSON).

**Interfaces:** For each of the 12 bundles in `conformance/bundles/*` (repo root,
resolve the relative path the same way `var`'s `ConformanceTest` did in the core plan —
confirm the exact relative depth from `var-junit`'s module root), run it through
`VarTestEngine` via `EngineTestKit` (pointing discovery at that bundle's `.md` file +
its Java step fixture, already authored in the core plan's Task 13 — reuse those exact
fixtures, do not author new ones) and assert the per-example pass/fail outcome matches
what that bundle's `golden/trace.json` declares (the `outcome` field per example/step —
read `trace.json`'s shape from the core plan's Task 19 work to know exactly what to
assert against). This is the sub-project-2 equivalent of the core plan's byte-for-byte
conformance gate — but here the "golden" is the pass/fail OUTCOME, not a wire-format
JSON diff, since `var-junit`'s job is to run tests, not produce JSON.

**Note on `error`-fence bundles** (e.g. `03-expected-failure`): the core inverts the
outcome (a satisfied expected-failure does NOT throw), so such an example should be
reported `SUCCESSFUL` by the engine — assert accordingly, matching how Python's Task 9
handled the identical case.

- [ ] **Step 1: Write the dogfood test**, parametrized per bundle (12 independently
  reported cases, not one loop).
- [ ] **Step 2: Run → PASS for all 12 bundles.** If any bundle fails, determine
  whether it's a `var-junit` bug or a latent fixture issue the core plan's Task 19
  didn't catch (Task 19's fixtures were only proven against `Execute` directly, not
  through a real test-runner adapter — a genuinely new integration surface, same
  category of risk Task 19 hit with its 5 fixture-arity bugs).
- [ ] **Step 3: Commit** — `test(java): var-junit dogfood — all 12 conformance bundles via EngineTestKit`

---

## Task 15: Final workspace check

- [x] **Step 1:** From `java/`: `mvn clean verify` — all 5 modules (parent, `var-core`,
  `var`, `var-runner`, `var-junit`) green. 315 tests total (205 var-core + 41 var + 35
  var-runner + 34 var-junit), 0 failures.
- [x] **Step 2:** Confirmed `var-runner` has zero `org.junit.platform.*` imports
  (`grep -rn "org.junit.platform" java/var-runner/src/main` → empty).
- [x] **Step 3:** Confirmed `var-core`/`var` are untouched by this plan (`git diff
  --stat 2a2bfad..HEAD -- java/var-core java/var` → empty — the only prior diff was
  the parent `pom.xml`'s `<modules>` addition in Task 1, which doesn't touch either
  module's own tree).
- [x] **Step 4: Commit** — no fixes needed; all checks passed clean.

---

## Task 16: Surface plan-stage diagnostics through JUnit reporting

**Follow-up from the final sub-project review.** `VarFileDescriptor.before()`
(Task 11) builds a `Run.RecordingReporter()` to satisfy `Execute.ExecutePorts`, then
discards its `.diagnostics()` — so a plan-stage diagnostic (e.g. bundle 05's
`ambiguous-match`, bundle 10's `error-fence-without-step`) is silently swallowed: the
affected example either passes vacuously or produces zero examples, with no signal
reaching JUnit reporting/IDEs. This is correct against the conformance contract (the
`trace.json` outcome is what's gated), but it's a real author-facing UX gap other
adapters (`var-vitest`/`var-pytest`) may already handle differently — worth checking.

**The real mechanism (confirmed via `javap` against the real 6.1.1 jar, not
assumed):** `org.junit.platform.engine.EngineExecutionListener` has
`reportingEntryPublished(TestDescriptor, ReportEntry)` (a `default` method);
`org.junit.platform.engine.reporting.ReportEntry` has static factories `from(String
key, String value)` / `from(Map<String,String>)`. This is the platform's own,
public, general-purpose mechanism for a `TestEngine` to attach arbitrary diagnostic
data to a `TestDescriptor` (surfaced to IDEs/build-tool reports) — it is NOT specific
to Jupiter.

**The threading problem to solve:** `VarEngineExecutionContext` (Task 7) is currently
empty, and `VarTestEngine.createExecutionContext(ExecutionRequest request)` discards
`request` entirely. The `EngineExecutionListener` is only available via
`ExecutionRequest.getEngineExecutionListener()` at that point — `Node.before(...)`
never receives it directly. Grow `VarEngineExecutionContext` to carry the listener
(set once in `createExecutionContext`), so `VarFileDescriptor.before(context)` can
call `context.listener().reportingEntryPublished(this,
ReportEntry.from("code", diagnostic.code().toString()))` (or however many key-value
pairs make sense — read `Diagnostics.Diagnostic`'s actual fields) for each collected
diagnostic, against the file container itself (or, if a diagnostic's `span` can be
matched back to a specific example, consider reporting against that leaf instead —
your call, but don't over-engineer this if file-level reporting is good enough for
v1).

- [ ] **Step 1:** Read `Diagnostics.Diagnostic`/`Diagnostics.DiagnosticCode` (in
  `var-core`) for the exact fields available to report.
- [ ] **Step 2:** Grow `VarEngineExecutionContext` with an `EngineExecutionListener`
  field; wire `VarTestEngine.createExecutionContext` to populate it from the real
  `request`.
- [ ] **Step 3:** In `VarFileDescriptor.before(context)`, after collecting
  diagnostics via the existing `Run.RecordingReporter`, publish one `ReportEntry` per
  diagnostic via `context`'s listener.
- [ ] **Step 4: Write a test** — via `EngineTestKit`, discover+execute a bundle/fixture
  known to produce a plan diagnostic (e.g. an ambiguous-match spec) and assert a
  `reportingEntryPublished` event actually fired with the expected content (check
  `EngineTestKit`'s `Events`/`Event` API for how to assert on reporting entries
  specifically, not just test outcomes).
- [ ] **Step 5: Run → PASS.** `mvn -f pom.xml clean test` from `java/`.
- [ ] **Step 6: Commit** — `feat(java): surface plan-stage diagnostics via JUnit ReportEntry`

---

## Task 17: Fix the multi-`UniqueIdSelector` same-file merge gap

**Follow-up from the final sub-project review.** Selecting two DIFFERENT examples
from the SAME file via two bare `UniqueIdSelector`s (no accompanying file/container
selector) in one discovery request currently produces two separate single-child
`VarFileDescriptor` containers (each independently built by
`VarFileSelectorResolver.resolveOneExample`) instead of one container with two
children — a real risk if an IDE's "run these N selected tests" ever emits exactly
this shape (single-example-file selections are unaffected and already correctly
tested).

**Correction to a prior review's suggested fix — verify this yourself before
proceeding:** an earlier review suggested this needs JUnit Jupiter's
`Filterable`/`DynamicDescendantFilter` machinery. **That suggestion was checked and
is wrong**: both classes live in `org.junit.jupiter.engine.descriptor` — confirmed via
`unzip -l` against the real `junit-jupiter-engine-6.1.1.jar` — meaning they are
package-private implementation details of the JUPITER engine module specifically, not
part of the public `junit-platform-engine` API any custom `TestEngine` can depend on
or reuse. Do not go down this path; verify it yourself (the classes genuinely aren't
on `var-junit`'s classpath, and `var-junit` has no dependency on
`junit-jupiter-engine`) and then look for the actual, accessible fix below.

**The likely real fix:** `VarFileSelectorResolver` is instantiated once per discovery
pass (confirm this by reading `DiscoverySelectorResolver.java`, where it's
constructed) — so it can hold state across multiple `resolve(...)` calls within one
request. Add a cache (e.g. `Map<String, VarFileDescriptor>` keyed by `specPath`) on
the resolver instance; when `resolveOneExample` (or the file-container resolver path)
would otherwise build a brand-new `VarFileDescriptor` for a spec path that's ALREADY
been resolved earlier in this same discovery pass, reuse the EXISTING instance and add
the new leaf to it instead of creating a sibling duplicate with a colliding
`UniqueId`. Read `EngineDiscoveryRequestResolver`/`SelectorResolver`'s
`Context.addToParent(...)` contract carefully first (Javadoc/decompile) — confirm
whether the generic framework already does some deduplication-by-UniqueId that your
fix needs to cooperate with rather than fight, and whether `addToParent` can be called
more than once validly for the "add another child to an already-added parent"
case, or whether you need a different call shape for that. **Investigate before
implementing** — this is exactly the kind of task where the right JUnit Platform
idiom matters and guessing produces a subtly-wrong fix.

- [ ] **Step 1:** Read `DiscoverySelectorResolver.java`/`VarFileSelectorResolver.java`
  in full; confirm the resolver's instantiation lifetime (once per discovery pass).
- [ ] **Step 2:** Investigate `EngineDiscoveryRequestResolver`'s real
  `Context.addToParent`/`SelectorResolver.Resolution` contract for how to correctly
  add a second child to an already-resolved parent.
- [ ] **Step 3:** Implement the cache-and-reuse fix (or whatever the real contract
  turns out to require).
- [ ] **Step 4: Write the failing-then-passing test** — via `EngineTestKit`, build a
  discovery request with TWO bare `UniqueIdSelector`s for two different examples in
  the SAME file (no file/container selector), and assert exactly ONE container with
  TWO children is discovered (not two containers with one child each, and not a
  duplicate-UniqueId error).
- [ ] **Step 5:** Confirm the existing single-example-selection test (Task 10) still
  passes unchanged — this fix must not regress the already-correct common case.
- [ ] **Step 6: Run → PASS.** `mvn -f pom.xml clean test` from `java/`.
- [ ] **Step 7: Commit** — `fix(java): merge multiple UniqueIdSelectors for the same file into one container`

---

## Self-Review

**Spec coverage:** `var-runner` shared layer (config, discovery, step loading, run
orchestration, failure rendering) → Tasks 1–6. JUnit Platform `TestEngine` (per ADR
0003) with discovery-time-visible, independently-selectable per-example tests → Tasks
7–13. Dogfood against the conformance-proven core → Task 14. Hexagonal boundary
(`var-runner` JUnit-agnostic) → enforced in Tasks 2/8's split and verified in Task 15.

**Placeholder scan:** Task 4's per-file `RegistryRegistrar`/context-key resolution and
Task 9's selector-resolution mechanics both carry explicit "read the real code/API
first, don't assume" directives rather than hand-waving — same pattern used for
`cucumber-expressions` in the core plan. The fixture/DI bridge and async/virtual-thread
questions the design doc left open are explicitly NOT in this plan's scope (deferred
per the design doc's own guidance) — not silently dropped, deliberately excluded.

**Type/name consistency:** `VarConfig(varsInclude, varsExclude, steps)` (Task 2)
threaded through `ConfigBridge` (Task 8) into discovery (Task 9). `LoadedSteps`
(Task 4) feeds `Run.planSpec`/`examplesWithRuns` (Task 5) feeds discovery's planning
step (Task 10) feeds execution (Task 11). `Render.renderFailure` (Task 6) consumed by
execution (Task 11).

**Known risks carried to execution:** `UniqueId` stability (Task 10, addressed by
line-based keys, not display names); Surefire auto-detection of a non-Jupiter engine
(Task 1's explicit Jupiter dependency + Task 7's empirical smoke test); config
precedence (Task 12's empirical verification); whether step loading is
once-per-discovery or per-file (Task 10, resolved toward once-per-discovery, matching
Python).

## References

- [ADR 0003 — Java JUnit integration](../../adr/0003-java-junit-integration.md)
- [`2026-07-01-java-junit-engine-design.md`](../specs/2026-07-01-java-junit-engine-design.md)
- Python precedent: [`2026-06-30-var-pytest-plugin.md`](2026-06-30-var-pytest-plugin.md)
- Core plan (completed): [`2026-07-01-java-core-port.md`](2026-07-01-java-core-port.md)
- `cucumber-junit-platform-engine` (cloned for ADR 0003's research) —
  `CucumberTestEngine`, `CucumberEngineDescriptor`, `CucumberTestDescriptor`,
  `DiscoverySelectorResolver`, its `pom.xml`'s Surefire/Jupiter comment.
- Core surfaces: `java/var-core/src/main/java/com/oselvar/var/core/*.java`,
  `java/var/src/main/java/com/oselvar/var/*.java`.
