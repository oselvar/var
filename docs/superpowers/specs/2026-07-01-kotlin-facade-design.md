# var-kotlin: an idiomatic Kotlin authoring facade over the Java engine

Date: 2026-07-01
Status: implemented (see docs/superpowers/plans/2026-07-01-kotlin-facade.md; risk
resolutions recorded in "Risks" below)

The Kotlin port. Unlike every previous port (Python, Java), Kotlin does **not**
re-port the pipeline: it layers an idiomatic Kotlin authoring API on the
already-conformance-green Java engine (`var-core`/`var`/`var-runner`/`var-junit`,
see [`2026-07-01-java-core-port-design.md`](2026-07-01-java-core-port-design.md)
and [`2026-07-01-java-junit-engine-design.md`](2026-07-01-java-junit-engine-design.md)).
Both compile to JVM bytecode, so the Kotlin facade calls the Java `Registrar`
directly — no second engine, no second conformance-parity effort.

The `adding-a-language-port` skill flags exactly this as a new pattern that must
be an explicit, written-down decision rather than something improvised mid-port.
This document is that decision.

## Decisions (from the 2026-07-01 design interview)

All user-confirmed:

1. **Engine strategy** — facade over the Java engine, not an independent port.
2. **Build layout** — Maven modules inside the existing `java/` reactor
   (`java/var-kotlin`, `java/var-kotest`), built with `kotlin-maven-plugin`.
   Not a top-level `kotlin/` Gradle workspace.
3. **Test runners** — reuse `var-junit` as-is (JUnit Platform is the de-facto
   Kotlin standard) **and** ship a Kotest adapter in v1.
4. **Author API** — one top-level `val steps = defineState(::Ctx) { … }` per
   `.steps.kt` file; bare `context`/`action`/`sensor` calls inside the block;
   the state is the handler lambda's *receiver* so `copy(…)` on a data class
   reads naturally; expression captures are typed lambda parameters. No class,
   no `StepDefinitions` override, no per-step `val`s. (Bare file-scope
   statements are a Kotlin compile error, which rules out the literal TS file
   shape; `.kts` scripts were considered and rejected — runtime script
   compilation is heavyweight and still wouldn't give prefix-free calls.)
5. **Coroutines** — `suspend` handlers from day one, bridged to the synchronous
   Java engine with `runBlocking`.
6. **Conformance scope** — registry stage only, gated through per-bundle
   `*.steps.kt` fixtures, plus ordinary facade unit tests. Parse/plan/trace
   stay proven by the Java engine's already-green corpus.

## The author API

```kotlin
// cukes.steps.kt — whole file, no class
data class Ctx(val cukes: Int = 0)

val steps = defineState(::Ctx) {
    context("I have {int} cukes") { n: Int ->
        copy(cukes = n)
    }
    action("I eat {int} cukes") { n: Int ->
        copy(cukes = cukes - n)
    }
    sensor("I should have {int} cukes left") {
        cukes
    }
}
```

- `defineState(factory) { block }` — `factory: () -> C` produces a fresh
  initial state per example (same contract as Java's
  `Registrar.defineState(Supplier<C>)`); the block runs against a
  `StepsScope<C>` receiver providing `context`/`action`/`sensor` and
  `parameterType`.
- **Handler shape**: state is the receiver, captures are parameters —
  `suspend C.(A) -> C` for context/action, `suspend C.(A) -> R` for sensors.
  The scope declares one overload per arity, mirroring the Java
  `StateBinder` ladder exactly (currently 0–2; extend in lockstep whenever the
  Java ladder grows). As in Java, the trailing data-table/doc-string argument
  the runtime appends counts as one arity slot.
- **State semantics follow the Java engine**: full-replacement immutable value
  (see `State.java`'s Task 11 decision), which is precisely what a data-class
  `copy(…)` produces. Return `this` for "no change". There is no TS-style
  partial merge.
- **Custom parameter types**: a `parameterType(name, regex) { captures -> … }`
  call inside the block, delegating to `Registrar.defineParameterType`. Must
  appear before any step that uses it (the Java registrar compiles each
  expression eagerly against the parameter types registered so far — same
  ordering rule Java authors already have).
- **Sensor return values** need no conversion layer: Kotlin's `listOf`/`mapOf`
  produce `java.util` collections at runtime, which is what the Java executor
  already compares.
- One `defineState` per `.steps.kt` file (the same one-state-factory-per-file
  rule as TS/Python/Java). The `val` must be non-`private` so the loader can
  see it (below).

## Registration is a replay, not a side effect

This is the key move that reconciles the file-scoped API with the Java port's
registration philosophy. `Registrar.java`'s javadoc argues *on principle* (not
just JVM-lifecycle pragmatics) that mutable accumulation belongs in a
shell-owned adapter, never a global in the facade — the Java port deliberately
rejected the TS/Python module-scope accumulator and its `_resetBuilder()` hatch.

So `defineState` does **not** register anything when the top-level `val`
initializes. It returns an inert, immutable value implementing the existing
Java `StepDefinitions` interface, capturing the factory and the DSL block
*unexecuted*:

```kotlin
fun <C : Any> defineState(
    factory: () -> C,
    block: StepsScope<C>.() -> Unit,
): StepDefinitions
```

The returned object's `defineSteps(registrar)` replays the block against a
`StepsScope` that adapts each call onto `registrar.defineState(...)`'s
`StateBinder`. Class-loading a `.steps.kt` file therefore only constructs a
value — no global mutable state, no reset hatch, fully re-runnable (each
`defineSteps` call replays against whatever fresh `Registrar` the shell
injects). The existing `StepLoader`/`RegistryRegistrar` machinery works
unchanged from that point on.

### State boxing (no `: State` in the dream API)

Java's `Registrar.defineState` requires `C extends State`, but the approved
API is a bare `data class Ctx(val cukes: Int = 0)` with no supertype. The
facade bridges with an internal wrapper:

```kotlin
internal class StateBox<C : Any>(val value: C) : State
```

The factory passed down is `Supplier { StateBox(factory()) }`; every wrapped
handler unboxes `StateBox<C>` → invokes the author lambda with `value` as the
receiver → boxes the returned state (sensors unbox and return the author's
value untouched). Entirely invisible outside `var-kotlin`.

Rejected alternatives: requiring `data class Ctx(…) : State` (pollutes the
approved API for the sake of an internal marker), and relaxing the generic
bound in the Java `Registrar` (ripples through a settled, shipped API).

### Suspend bridging

Handler lambdas are `suspend`; the `StateBinder` SAM wrappers invoke them via
`runBlocking { … }`. This adds `kotlinx-coroutines-core` as a `var-kotlin`
dependency. The Java executor stays synchronous and unaware.

## Source location: the glue-frame problem

`RegistryRegistrar.register` captures each step's `expressionSourceFile`/
`expressionSourceLine` via `StackWalker`, skipping only its own frames. With
the Kotlin DSL in between, the first non-registrar frame is `var-kotlin`'s
`StepsScope` — the wrong file. But one frame further sits the author's DSL
block lambda, whose declaring class is compiled from the author's
`cukes.steps.kt`, with the line number of the in-progress `context(…)` call.

Fix: a runtime-retained marker annotation in the Java `var` module (e.g.
`@com.oselvar.var.RegistrarGlue`), applied by `var-kotlin` to its scope/binder
classes. `RegistryRegistrar`'s frame filter additionally skips frames whose
declaring class carries the annotation (requires
`StackWalker.Option.RETAIN_CLASS_REFERENCE`). Dependency direction is fine —
`var-kotlin` depends on `var`, the annotation lives in `var` and knows nothing
about Kotlin.

Rejected alternative: making `StepsScope`'s functions `inline` so the glue
frames vanish. Tempting (zero Java changes), but inlined Kotlin bytecode's
line-number attribution goes through JSR-45 SMAPs, which `StackWalker` does
not decode — the reported file could be the *declaration* file (`StepsScope.kt`)
rather than the call site. Not worth betting the location contract on;
verify-then-simplify later if someone cares.

## Discovery: loading a top-level `val` through `StepLoader`

`StepLoader.loadSteps` currently resolves each configured name to a class
implementing `StepDefinitions` and instantiates it via a no-arg constructor. A
top-level `val steps` compiles to a *file facade class* (`Cukes_stepsKt`) that
does **not** implement the interface — it exposes a static `getSteps()`
returning one.

Generalize `StepLoader` (in `var-runner`, but Kotlin-agnostically — this is
plain reflection over static factory methods, meaningful for any JVM
language):

- If the resolved class implements `StepDefinitions` → instantiate (today's
  path, unchanged).
- Otherwise → collect its public static no-arg methods whose return type is
  assignable to `StepDefinitions`, invoke each, and treat every returned
  instance as one loaded step-definition unit (its own fresh
  `RegistryRegistrar`, exactly like a class instance today).
- If neither applies → the existing "does not implement StepDefinitions"
  error, extended to mention the static-factory alternative.

Config surface is unchanged: `var.steps` entries are FQCNs, each resolved
individually via `Class.forName` (`junit-platform.properties` / system
property, per the Java engine design). No package scanning exists in any
adapter today — if it is ever added, its inclusion predicate must accept the
static-factory shape too, or Kotlin step files in a scanned package would be
silently skipped. Kotlin authors can pin the facade class name with
`@file:JvmName("CukeSteps")` if they care about the FQCN's spelling.

Edge to enforce: two qualifying `val`s in one `.steps.kt` file share the same
`expressionSourceFile`, which would silently collide in `StepLoader`'s
`factoriesByFile` map. Detect the duplicate file key and fail with a clear
"one defineState per file" error (also fixes the latent Java-side silent
overwrite for two classes in one source file).

## var-kotest: the Kotest adapter

Second module, `java/var-kotest`, depends on `var-kotlin` + `var-runner` +
Kotest. Kotest runs on the JUnit Platform but through its own engine, so the
`var-junit` engine and Kotest coexist in one build already — this adapter is
for teams who want var examples *inside* their Kotest world rather than as a
sibling engine.

Shape (design-level; the task plan pins exact Kotest APIs against the current
stable major):

- A `VarSpec` base class (or equivalent root-scope extension function for
  `FunSpec`-style specs): on registration it reads the same three config keys
  (`var.vars.include`/`var.vars.exclude`/`var.steps`) via
  `VarConfig.fromLookup` over system properties + a classpath properties file
  — one config story across both adapters.
- Discovery and step loading delegate wholesale to `var-runner`
  (`Discovery`, `StepLoader`, `Run`); the adapter registers **one Kotest test
  per planned example**, container-per-file, names matching the JUnit engine's
  `file > example` shape.
- Failure rendering reuses `var-runner`'s `Render` / the core's structured
  failures — never re-derived in the adapter (same rule as every adapter).
- No pipeline logic, no per-example fixture lifecycle in v1 (same explicit
  defer as `var-pytest` and `var-junit`).

## Conformance gating (registry stage) + testing

- **Fixtures**: one `<stem>.steps.kt` per bundle in `conformance/bundles/NN-*/`,
  named exactly like the TS/Python fixtures (`numerals.steps.kt`, …). Kotlin
  imposes no file-name–class-name coupling, so unlike Java's `NumeralsSteps.java`
  workaround the shared stem rule is satisfied by plain extension-stripping —
  `Conformance.fileStem`'s existing fallback path handles `.kt` with **no
  changes** (and the `StackWalker` naturally captures `numerals.steps.kt` as
  the source file, since the author-visible frame lives in the fixture).
  Each fixture declares `package com.oselvar.varkt.conformance.bundleNN`
  (Kotlin doesn't require directory/package agreement; the `varkt` root avoids
  back-ticking the `var` keyword) and holds the approved
  top-level-`val` shape, registering the same expressions, parameter types,
  and deterministic handlers as its `.steps.ts`/`.steps.py`/`…Steps.java`
  siblings.
- **Registry gate**: `var-kotlin`'s `ConformanceTest` mirrors
  `java/var`'s — per-bundle parameterized test, replay the fixture's
  `StepDefinitions` against a fresh `RegistryRegistrar`, project with
  `Conformance.toRegistryArtifact`, `CanonicalJson.canonicalStringify`,
  byte-for-byte against `golden/registry.json`. Bundles are wired via the
  `kotlin-maven-plugin` test-compile execution's explicit `<sourceDirs>`
  (src/test/kotlin + `conformance/bundles`) — kotlinc-only, deliberately NOT
  `build-helper-maven-plugin` as `java/var` uses, so javac never recompiles
  the sibling `*Steps.java` fixtures into this module.
- **Facade unit tests** (Kotlin, JUnit Jupiter — the rest of the reactor's
  convention) cover what the registry gate can't see: receiver binding
  (`copy(…)` gets the right `this`), capture-arity dispatch across the ladder,
  `StateBox` round-tripping through a real `Execute` run, suspend handlers
  (including one that actually suspends), `parameterType` ordering,
  source-location capture pointing at the `.steps.kt` line, and `StepLoader`
  loading a real top-level `val` (plus the duplicate-`val` error).
- **End-to-end smoke**: one `EngineTestKit` run of the `var-junit` engine
  against a spec + Kotlin steps, and one Kotest run through `var-kotest` —
  proving both adapters drive Kotlin-authored steps unmodified.
- All green from `java/`: `mvn test` across the reactor.

## Build

- `java/pom.xml` gains two modules and the version properties
  (`kotlin.version`, `kotlinx-coroutines.version`, `kotest.version`); the
  `kotlin-maven-plugin` block itself is configured per Kotlin module (a
  candidate for parent `pluginManagement` in a later cleanup), `jvmTarget`
  matching the reactor's Java release. `var-kotlin` depends on `var` +
  `kotlinx-coroutines-core`; `var-kotest` on `var-kotlin`, `var-runner`,
  Kotest.
- Consumers of the pure-Java artifacts are unaffected — no Kotlin stdlib leaks
  into `var`/`var-core`/`var-runner`/`var-junit` (the `@RegistrarGlue`
  annotation is plain Java).

## Risks / open questions — RESOLVED during implementation (2026-07-02)

- **Zero-parameter lambda overload ambiguity** — **materialized exactly as
  flagged**: K2 rejects `sensor("…") { cukes }` with "Overload resolution
  ambiguity" when the arity-0 and arity-1 overloads are same-scope members (a
  parameterless lambda type-checks against both a 0-parameter and a
  1-parameter function type via implicit `it`). Resolved with a
  **member/extension split**: the zero-parameter overloads are `StepsScope`
  members, the capturing arities are top-level extension functions — members
  win resolution for parameterless lambdas, parameter-declaring lambdas are
  inapplicable to the member and bind the extension. The approved example
  compiles verbatim (gated by `DefineStateTest.canonicalSteps` and, from a
  foreign package, `CrossPackageTest`). Two consequences:
  - *Author-visible*: a `.steps.kt` in its own package imports the extensions
    alongside `defineState` (`import com.oselvar.varkt.{context,action,sensor}`
    or a wildcard; IDE auto-import handles it).
  - *Runtime semantics*: `Execute.invokeHandler` dispatches by EXACT parameter
    count, so an arity-0 registration on a capturing expression would fail at
    execution. Handlers therefore register through arity-tolerant
    `ContextAdapter`/`SensorAdapter` shims (one `apply` overload per call
    shape, state + 0..3 args) that drop surplus captured arguments — the TS
    facade's semantics, and the only reading under which the approved
    `sensor("… {int} …") { cukes }` *runs*, not just compiles. Declaring more
    parameters than the step supplies raises an authoring error.
- **StackWalker through Kotlin lambdas** — verified on temurin-21: after the
  glue skip the frame is the author's DSL-block lambda with the correct file
  and per-call line. One addition beyond the design: the extension overloads
  live in `DefineState.kt`'s file-facade class, which kotlinc lets us annotate
  with `@file:RegistrarGlue` (Java TYPE-targeted annotations are legal file
  annotations and land on the facade class) — without it, extension-registered
  steps attributed to `DefineState.kt`.
- **`suspend` + SAM wrapper allocation** — no issues observed; `runBlocking`
  bridging is exercised by a genuinely suspending handler (`delay`) in
  `ExecuteIntegrationTest` and under Kotest's coroutine-based execution in
  `var-kotest`'s smoke specs.
- **Kotest major version** — pinned 6.2.1. The abstract-spec shape
  (`VarSpec : FunSpec()` registering from `init`) is the clean form. The
  junit-bom-6.1.1-vs-Kotest platform-version conflict did not materialize.
  One API note: `Spec.rootTests()` does not exist in 6.2.1; the registration
  guard uses `Spec.tests()` (`@KotestInternal`, opted in knowingly).

## References

- Interview decisions: this doc's "Decisions" section (recorded 2026-07-01).
- Java surfaces this builds on:
  `java/var/src/main/java/com/oselvar/var/{Registrar,RegistryRegistrar,StateBinder,StepDefinitions,State}.java`,
  `java/var-runner/src/main/java/com/oselvar/var/runner/{StepLoader,VarConfig,Discovery,Run}.java`,
  `java/var-junit/src/main/java/com/oselvar/var/junit/*.java`.
- Registry-stage precedent: `java/var/src/test/java/com/oselvar/var/ConformanceTest.java`.
- TS authoring reference (the feel being ported):
  `typescript/packages/var/src/{index,internal}.ts`.
- Process precedent: [`2026-06-30-var-pytest-plugin-design.md`](2026-06-30-var-pytest-plugin-design.md),
  [`2026-07-01-java-junit-engine-design.md`](2026-07-01-java-junit-engine-design.md).
- Skill: `.claude/skills/adding-a-language-port/SKILL.md` ("For a Java →
  Kotlin sequence specifically" — this doc is the written-down option (b)).
