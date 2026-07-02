# Kotlin Facade (var-kotlin + var-kotest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An idiomatic Kotlin authoring API (top-level `val steps = defineState(::Ctx) { … }`) over the existing Java engine, runnable through both the `var-junit` JUnit Platform engine and a new Kotest adapter, gated by the registry-stage conformance corpus.

**Architecture:** Kotlin does NOT re-port the pipeline (see
`docs/superpowers/specs/2026-07-01-kotlin-facade-design.md`). `defineState`
returns an inert, replayable `com.oselvar.var.StepDefinitions` — the DSL block
is stored unexecuted and replayed against whatever fresh `Registrar` the shell
injects, preserving the Java port's no-static-accumulator principle. State is
boxed in an internal `StateBox<C> : State` so authors' data classes need no
supertype; handler lambdas get the state as receiver; `suspend` handlers bridge
via `runBlocking`. Two small Java-side changes enable this: a `@RegistrarGlue`
frame-skip annotation (so `StackWalker` source locations point at the author's
`.steps.kt`, not the DSL glue) and a `StepLoader` generalization (static
factory methods returning `StepDefinitions`, so a compiled top-level `val` is
loadable).

**Tech Stack:** Maven reactor at `java/` · Kotlin 2.4.0 (kotlin-maven-plugin) · kotlinx-coroutines-core-jvm 1.11.0 · JUnit 6.1.1 (managed by parent) · Kotest 6.2.1 · cucumber-expressions 20.0.0 (transitive).

## Global Constraints

- All Maven commands run against `java/pom.xml` from the repo root: `mvn -f java/pom.xml …`. Never `cd` out of the worktree.
- Java release 21 (`maven.compiler.release` in the parent); Kotlin `jvmTarget` must be `21`.
- Versions (verified on repo1.maven.org 2026-07-01): Kotlin **2.4.0**, kotlinx-coroutines-core-jvm **1.11.0**, Kotest **6.2.1**. Parent already manages JUnit **6.1.1** via `junit-bom`.
- Author-facing Kotlin package is `com.oselvar.varkt` (NOT `com.oselvar.var.kotlin`): `var` is a Kotlin hard keyword, and a package segment named `var` would force every author import to be back-ticked (`import com.oselvar.`var`.…`). Internal Kotlin code importing the Java `com.oselvar.var.*` types uses backticks; that never leaks to authors.
- Kotlin step files may have dotted names (`cukes.steps.kt`); every such file MUST carry `@file:JvmName("…")` with a valid identifier so the file-facade class name is deterministic (the default facade name for a dotted filename is compiler-mangled).
- Trunk-based: each task ends green (`mvn -f java/pom.xml test` for the touched modules) and committed. Commit trailer:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017h1WEs7ReorF43DQsu4u4K
```

---

### Task 1: `@RegistrarGlue` annotation + `RegistryRegistrar` frame skipping

The Kotlin DSL sits between the author's lambda and `RegistryRegistrar.register`, so the `StackWalker` there would capture the DSL's own file as every step's source location. Fix on the Java side: an annotation that marks "registration glue" classes whose frames the walker skips.

**Files:**
- Create: `java/var/src/main/java/com/oselvar/var/RegistrarGlue.java`
- Modify: `java/var/src/main/java/com/oselvar/var/RegistryRegistrar.java` (the `register` method, currently lines 60–83)
- Test (create): `java/var/src/test/java/com/oselvar/var/GlueForwarder.java`
- Test (create): `java/var/src/test/java/com/oselvar/var/RegistrarGlueTest.java`

**Interfaces:**
- Consumes: existing `Registrar`, `RegistryRegistrar`, `StateBinder`, `State`.
- Produces: `@com.oselvar.var.RegistrarGlue` (`@Retention(RUNTIME) @Target(TYPE)`), honored by `RegistryRegistrar.register`'s frame filter (including nested/anonymous classes of an annotated class, via `getEnclosingClass()` walk). Task 2's `StepsScope` applies it.

- [ ] **Step 1: Write the failing test**

`java/var/src/test/java/com/oselvar/var/GlueForwarder.java` — a *separate file* (the whole point is that its `StackWalker` file name differs from the test's):

```java
package com.oselvar.var;

/**
 * Test double for a registration-forwarding layer (what var-kotlin's StepsScope
 * is in production): annotated {@link RegistrarGlue}, so {@link RegistryRegistrar}'s
 * StackWalker must skip its frames and attribute the registration to THIS class's
 * caller, not this class.
 */
@RegistrarGlue
final class GlueForwarder {

    private GlueForwarder() {}

    record Ctx() implements State {}

    static void forwardAction(StateBinder<Ctx> binder, String expression) {
        binder.action(expression, (Ctx ctx) -> ctx);
    }
}
```

`java/var/src/test/java/com/oselvar/var/RegistrarGlueTest.java`:

```java
package com.oselvar.var;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.oselvar.var.core.Registry;
import org.junit.jupiter.api.Test;

class RegistrarGlueTest {

    @Test
    void framesOfRegistrarGlueAnnotatedClassesAreSkipped() {
        RegistryRegistrar registrar = new RegistryRegistrar();
        StateBinder<GlueForwarder.Ctx> binder = registrar.defineState(GlueForwarder.Ctx::new);

        GlueForwarder.forwardAction(binder, "I do a forwarded thing");

        Registry.StepRegistration step = registrar.registry().steps().get(0);
        // The registration must be attributed to THIS test (the glue's caller),
        // not to GlueForwarder.java.
        assertEquals("RegistrarGlueTest.java", step.expressionSourceFile());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn -f java/pom.xml -pl var -am test -Dtest=RegistrarGlueTest`
Expected: compile error — `RegistrarGlue` does not exist. (After creating only the annotation in Step 3a it must FAIL with `expected: <RegistrarGlueTest.java> but was: <GlueForwarder.java>` — run again mid-step to see the real red.)

- [ ] **Step 3: Implement**

3a. `java/var/src/main/java/com/oselvar/var/RegistrarGlue.java`:

```java
package com.oselvar.var;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a registration-forwarding ("glue") class whose stack frames {@link
 * RegistryRegistrar} must skip when capturing a step's author-side source
 * location. Without this, a facade layered over {@link Registrar} (e.g.
 * var-kotlin's {@code StepsScope}) would be recorded as every step's {@code
 * expressionSourceFile} instead of the author's own step file. Applies to the
 * annotated class and its nested/anonymous classes.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface RegistrarGlue {}
```

3b. In `RegistryRegistrar.java`, replace the body of `register` (keep the javadoc-adjacent comments; the diff below is the whole method):

```java
    private void register(String expression, StepKind kind, Object handler) {
        String thisClass = RegistryRegistrar.class.getName();
        String nestedPrefix = thisClass + "$";
        StackWalker.StackFrame caller =
                StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE)
                        .walk(
                                frames ->
                                        frames.filter(
                                                        f -> {
                                                            Class<?> declaring = f.getDeclaringClass();
                                                            String cn = declaring.getName();
                                                            // Exact match (this class) or a nested class of
                                                            // it (e.g. Binder) — NOT mere string-prefix, which
                                                            // would wrongly also skip an unrelated class whose
                                                            // name happens to start with the same characters
                                                            // (e.g. a caller named "RegistryRegistrarTest").
                                                            return !cn.equals(thisClass)
                                                                    && !cn.startsWith(nestedPrefix)
                                                                    && !isRegistrarGlue(declaring);
                                                        })
                                                .findFirst()
                                                .orElseThrow());
        registry =
                Registry.addStep(
                        registry, expression, caller.getFileName(), caller.getLineNumber(), handler, kind);
    }

    /**
     * A frame belongs to registration glue if its declaring class — or any class
     * enclosing it (covers lambdas/anonymous classes synthesized inside a glue
     * class) — is annotated {@link RegistrarGlue}.
     */
    private static boolean isRegistrarGlue(Class<?> declaring) {
        for (Class<?> c = declaring; c != null; c = c.getEnclosingClass()) {
            if (c.isAnnotationPresent(RegistrarGlue.class)) {
                return true;
            }
        }
        return false;
    }
```

Note the walker now needs `RETAIN_CLASS_REFERENCE` (it previously used the no-arg `getInstance()`).

- [ ] **Step 4: Run the tests to verify they pass (whole module — the existing `RegistryRegistrarTest` must stay green)**

Run: `mvn -f java/pom.xml -pl var -am test`
Expected: BUILD SUCCESS, `RegistrarGlueTest` passing.

- [ ] **Step 5: Commit**

```bash
git add java/var/src/main/java/com/oselvar/var/RegistrarGlue.java java/var/src/main/java/com/oselvar/var/RegistryRegistrar.java java/var/src/test/java/com/oselvar/var/GlueForwarder.java java/var/src/test/java/com/oselvar/var/RegistrarGlueTest.java
git commit -m "feat(java): skip @RegistrarGlue frames when capturing step source locations"
```

---

### Task 2: `var-kotlin` module + `defineState`/`StepsScope` DSL

**Files:**
- Modify: `java/pom.xml` (modules list + version properties)
- Create: `java/var-kotlin/pom.xml`
- Create: `java/var-kotlin/src/main/kotlin/com/oselvar/varkt/DefineState.kt`
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/DefineStateTest.kt`

**Interfaces:**
- Consumes: `Registrar.defineState(Supplier<C>)` → `StateBinder<C>`; `StateBinder.Context0/1/2` (`apply(C[, A[, B]]) → C`) and `Sensor0/1/2` (`apply(C[, A[, B]]) → R`); `StepDefinitions.defineSteps(Registrar)` (SAM); `@RegistrarGlue` (Task 1); `RegistryRegistrar.registry()/stateFactory()` in tests.
- Produces (author API, package `com.oselvar.varkt`):
  - `fun <C : Any> defineState(factory: () -> C, block: StepsScope<C>.() -> Unit): StepDefinitions`
  - `class StepsScope<C : Any>` with `context`/`action` overloads for handler types `suspend C.() -> C`, `suspend C.(A) -> C`, `suspend C.(A, B) -> C`, and `sensor` overloads for `suspend C.() -> R`, `suspend C.(A) -> R`, `suspend C.(A, B) -> R`.
  - `internal class StateBox<C : Any>(val value: C) : State` — Tasks 3/6 reference it in assertions (visible to this module's tests via the Kotlin test-friend relationship).

- [ ] **Step 1: Wire the build (this must exist before any test can even compile)**

1a. In `java/pom.xml`, add to `<modules>` (after `<module>var-junit</module>`):

```xml
    <module>var-kotlin</module>
```

and to `<properties>`:

```xml
    <!-- Kotlin toolchain + libraries for the var-kotlin/var-kotest facade modules.
         Versions confirmed on repo1.maven.org (maven-metadata.xml) 2026-07-01:
         kotlin 2.4.0 = latest stable (2.4.20-Beta1 excluded), coroutines 1.11.0,
         kotest 6.2.1. -->
    <kotlin.version>2.4.0</kotlin.version>
    <kotlinx-coroutines.version>1.11.0</kotlinx-coroutines.version>
    <kotest.version>6.2.1</kotest.version>
```

1b. Create `java/var-kotlin/pom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>com.oselvar</groupId>
    <artifactId>var-parent</artifactId>
    <version>0.0.0</version>
  </parent>

  <artifactId>var-kotlin</artifactId>
  <packaging>jar</packaging>
  <name>var (Kotlin) — author facade over the Java engine</name>
  <description>
    Idiomatic Kotlin authoring API layered on the Java engine — no second
    pipeline port (see docs/superpowers/specs/2026-07-01-kotlin-facade-design.md).
    Author-facing package is com.oselvar.varkt because `var` is a Kotlin hard
    keyword and would force back-ticked imports.
  </description>

  <dependencies>
    <dependency>
      <groupId>com.oselvar</groupId>
      <artifactId>var</artifactId>
      <version>${project.version}</version>
    </dependency>
    <dependency>
      <groupId>org.jetbrains.kotlin</groupId>
      <artifactId>kotlin-stdlib</artifactId>
      <version>${kotlin.version}</version>
    </dependency>
    <dependency>
      <groupId>org.jetbrains.kotlinx</groupId>
      <artifactId>kotlinx-coroutines-core-jvm</artifactId>
      <version>${kotlinx-coroutines.version}</version>
    </dependency>
  </dependencies>

  <build>
    <sourceDirectory>src/main/kotlin</sourceDirectory>
    <testSourceDirectory>src/test/kotlin</testSourceDirectory>
    <plugins>
      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>${kotlin.version}</version>
        <executions>
          <execution>
            <id>compile</id>
            <goals><goal>compile</goal></goals>
          </execution>
          <execution>
            <id>test-compile</id>
            <goals><goal>test-compile</goal></goals>
          </execution>
        </executions>
        <configuration>
          <jvmTarget>21</jvmTarget>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 2: Write the failing test**

`java/var-kotlin/src/test/kotlin/com/oselvar/varkt/DefineStateTest.kt`. This test IS the spec's two flagged risks made executable: the canonical interview-approved example must compile **as written** (zero-parameter lambdas like `sensor("…") { cukes }` and typed one-parameter lambdas resolving across the overload ladder), and source locations must point at this file, not the DSL.

```kotlin
package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.State
import com.oselvar.`var`.StateBinder
import com.oselvar.`var`.StepDefinitions
import com.oselvar.`var`.core.StepKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DefineStateTest {

    data class Ctx(val cukes: Int = 0)

    // The interview-approved canonical example, verbatim shape: bare context/
    // action/sensor calls, state as receiver, typed captures, a zero-parameter
    // sensor lambda. If overload resolution is ambiguous for `{ cukes }`, THIS
    // fails to compile — that is the spec's flagged spike. Do NOT "fix" it by
    // changing this test to `{ -> cukes }`; stop and report instead (the
    // approved API shape would need revisiting with the user).
    private fun canonicalSteps(): StepDefinitions = defineState(::Ctx) {
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

    @Test
    fun `top-level defineState registers nothing until replayed`() {
        val definitions = canonicalSteps() // constructing the value is inert
        val registrar = RegistryRegistrar()
        assertTrue(registrar.registry().steps().isEmpty())
        definitions.defineSteps(registrar) // replay is what registers
        assertEquals(3, registrar.registry().steps().size)
    }

    @Test
    fun `registers expressions kinds and author-side source locations`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)
        val steps = registrar.registry().steps()

        assertEquals(
            listOf("I have {int} cukes", "I eat {int} cukes", "I should have {int} cukes left"),
            steps.map { it.expression() },
        )
        assertEquals(
            listOf(StepKind.CONTEXT, StepKind.ACTION, StepKind.SENSOR),
            steps.map { it.kind() },
        )
        // Glue-frame skipping (Task 1) must make every location point at THIS
        // file, on strictly increasing lines (each context/action/sensor call
        // sits on its own line above).
        assertTrue(steps.all { it.expressionSourceFile() == "DefineStateTest.kt" }) {
            "expected DefineStateTest.kt, got ${steps.map { it.expressionSourceFile() }}"
        }
        assertTrue(
            steps.map { it.expressionSourceLine() }.zipWithNext().all { (a, b) -> a < b },
        ) { "expected increasing lines, got ${steps.map { it.expressionSourceLine() }}" }
    }

    @Test
    fun `context handler gets state as receiver and returns the full replacement`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)

        @Suppress("UNCHECKED_CAST")
        val have = registrar.registry().steps()[0].handler() as StateBinder.Context1<State, Int>
        val initial = registrar.stateFactory()!!.get()

        val evolved = have.apply(initial, 8) as StateBox<Ctx>
        assertEquals(Ctx(cukes = 8), evolved.value)
    }

    @Test
    fun `sensor handler reads the receiver and returns the observed value`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)

        @Suppress("UNCHECKED_CAST")
        val left = registrar.registry().steps()[2].handler() as StateBinder.Sensor1<State, Int, Any?>

        assertEquals(5, left.apply(StateBox(Ctx(cukes = 5)), 5))
    }

    @Test
    fun `each replay gets a fresh state factory producing fresh boxes`() {
        val registrar = RegistryRegistrar()
        canonicalSteps().defineSteps(registrar)
        val factory = registrar.stateFactory()!!
        val a = factory.get() as StateBox<Ctx>
        val b = factory.get() as StateBox<Ctx>
        assertTrue(a !== b)
        assertEquals(Ctx(cukes = 0), a.value)
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test`
Expected: FAIL — kotlin compile error, `defineState`/`StepsScope`/`StateBox` unresolved.

- [ ] **Step 4: Implement `DefineState.kt`**

`java/var-kotlin/src/main/kotlin/com/oselvar/varkt/DefineState.kt`:

```kotlin
@file:JvmName("DefineState")

package com.oselvar.varkt

import com.oselvar.`var`.Registrar
import com.oselvar.`var`.RegistrarGlue
import com.oselvar.`var`.State
import com.oselvar.`var`.StateBinder
import com.oselvar.`var`.StepDefinitions
import java.util.function.Supplier
import kotlinx.coroutines.runBlocking

/**
 * Bridges an author's bare data-class state into the Java engine's
 * `C extends State` bound: the factory boxes, every wrapped handler unboxes to
 * invoke the author lambda with the state as receiver, and reboxes the result.
 * Never visible outside this module.
 */
internal class StateBox<C : Any>(val value: C) : State

/**
 * The var-kotlin author entry point. Returns an INERT, replayable
 * [StepDefinitions]: nothing registers when a top-level
 * `val steps = defineState(::Ctx) { … }` initializes — the block is stored and
 * replayed against whatever fresh [Registrar] the runner injects via
 * [StepDefinitions.defineSteps]. This keeps the Java port's rule that mutable
 * accumulation lives in the shell, never in a facade-global (see Registrar's
 * javadoc), while giving Kotlin authors a file-scoped API.
 */
fun <C : Any> defineState(
    factory: () -> C,
    block: StepsScope<C>.() -> Unit,
): StepDefinitions = StepDefinitions { registrar ->
    val binder = registrar.defineState(Supplier { StateBox(factory()) })
    StepsScope(registrar, binder).block()
}

/**
 * The receiver of a [defineState] block: bare `context`/`action`/`sensor`
 * calls, one overload per capture arity, mirroring the Java [StateBinder]
 * ladder (0–2; extend in lockstep when the Java ladder grows — the trailing
 * data-table/doc-string argument the runtime appends counts as one slot).
 * Handlers are `suspend` with the state as receiver; they run on the Java
 * engine's synchronous executor via [runBlocking].
 *
 * Annotated [RegistrarGlue] so registration-time StackWalker frames of this
 * class are skipped and each step's source location is the author's own
 * `.steps.kt` call site.
 */
@RegistrarGlue
class StepsScope<C : Any> internal constructor(
    private val registrar: Registrar,
    private val binder: StateBinder<StateBox<C>>,
) {

    fun context(expression: String, handler: suspend C.() -> C) {
        binder.context(
            expression,
            StateBinder.Context0<StateBox<C>> { box -> StateBox(runBlocking { handler(box.value) }) },
        )
    }

    fun <A> context(expression: String, handler: suspend C.(A) -> C) {
        binder.context(
            expression,
            StateBinder.Context1<StateBox<C>, A> { box, a -> StateBox(runBlocking { handler(box.value, a) }) },
        )
    }

    fun <A, B> context(expression: String, handler: suspend C.(A, B) -> C) {
        binder.context(
            expression,
            StateBinder.Context2<StateBox<C>, A, B> { box, a, b ->
                StateBox(runBlocking { handler(box.value, a, b) })
            },
        )
    }

    fun action(expression: String, handler: suspend C.() -> C) {
        binder.action(
            expression,
            StateBinder.Context0<StateBox<C>> { box -> StateBox(runBlocking { handler(box.value) }) },
        )
    }

    fun <A> action(expression: String, handler: suspend C.(A) -> C) {
        binder.action(
            expression,
            StateBinder.Context1<StateBox<C>, A> { box, a -> StateBox(runBlocking { handler(box.value, a) }) },
        )
    }

    fun <A, B> action(expression: String, handler: suspend C.(A, B) -> C) {
        binder.action(
            expression,
            StateBinder.Context2<StateBox<C>, A, B> { box, a, b ->
                StateBox(runBlocking { handler(box.value, a, b) })
            },
        )
    }

    fun <R> sensor(expression: String, handler: suspend C.() -> R) {
        binder.sensor(
            expression,
            StateBinder.Sensor0<StateBox<C>, R> { box -> runBlocking { handler(box.value) } },
        )
    }

    fun <A, R> sensor(expression: String, handler: suspend C.(A) -> R) {
        binder.sensor(
            expression,
            StateBinder.Sensor1<StateBox<C>, A, R> { box, a -> runBlocking { handler(box.value, a) } },
        )
    }

    fun <A, B, R> sensor(expression: String, handler: suspend C.(A, B) -> R) {
        binder.sensor(
            expression,
            StateBinder.Sensor2<StateBox<C>, A, B, R> { box, a, b -> runBlocking { handler(box.value, a, b) } },
        )
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test`
Expected: BUILD SUCCESS, all 5 `DefineStateTest` tests passing.

**Spike gate:** if Step 5 instead fails compiling `canonicalSteps()` with an overload-resolution ambiguity on the zero-parameter lambdas (`{ cukes }` / a hypothetical `{ this }`), STOP — do not weaken the test. Report the exact compiler error; the approved API shape needs a user decision (spec's "Risks" section lists the candidate mitigations).

- [ ] **Step 6: Commit**

```bash
git add java/pom.xml java/var-kotlin
git commit -m "feat(kotlin): var-kotlin module with replay-based defineState DSL"
```

---

### Task 3: End-to-end through the Java engine (suspend handlers, sensor comparison)

Prove the boxed handlers survive the real pipeline: `Parse → Plan → Execute` with a genuinely suspending handler, state evolution across steps, sensor pass, and a span-anchored sensor failure.

**Files:**
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ExecuteIntegrationTest.kt`

**Interfaces:**
- Consumes: Task 2's `defineState`; `com.oselvar.var.core.{Parse, Plan, Execute, CellDiff}`; `RegistryRegistrar.stateFactory()`. `Execute.ExecutePorts(Reporter, Function<String, Object>, ExecutionObserver)`; `Execute.executePlan(plan, ports)` throws on the first failing example; a sensor's non-null return with ≥1 capture is compared against the LAST captured parameter (Execute's documented contract).
- Produces: nothing new — a regression net for every later task.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.core.CellDiff
import com.oselvar.`var`.core.Execute
import com.oselvar.`var`.core.Parse
import com.oselvar.`var`.core.Plan
import java.util.function.Function
import kotlinx.coroutines.delay
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ExecuteIntegrationTest {

    data class Ctx(val cukes: Int = 0)

    private fun steps() = defineState(::Ctx) {
        context("I have {int} cukes") { n: Int -> copy(cukes = n) }
        action("I eat {int} cukes") { n: Int ->
            delay(1) // proves a genuinely suspending handler runs through runBlocking
            copy(cukes = cukes - n)
        }
        sensor("I should have {int} cukes left") { cukes }
    }

    private fun execute(source: String) {
        val registrar = RegistryRegistrar()
        steps().defineSteps(registrar)
        val plan = Plan.plan(Parse.parse("cukes.md", source), registrar.registry())
        val ports = Execute.ExecutePorts(
            Execute.Reporter { },
            Function { registrar.stateFactory()!!.get() },
            null,
        )
        Execute.executePlan(plan, ports)
    }

    @Test
    fun `passing example evolves boxed state and satisfies the sensor comparison`() {
        execute("# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 5 cukes left.\n")
    }

    @Test
    fun `mismatching sensor return fails with a span-anchored cell mismatch`() {
        // Sensor returns 5 but the Markdown claims 99 -> compared against the
        // last captured parameter -> CellMismatchException from the pure core.
        assertThrows(CellDiff.CellMismatchException::class.java) {
            execute("# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 99 cukes left.\n")
        }
    }
}
```

- [ ] **Step 2: Run the test to verify current state**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test -Dtest=ExecuteIntegrationTest`
Expected: PASS immediately if Task 2's wrappers are correct — this is an integration test of already-written code, so a pass is the desired outcome, not a suspicious one. If it fails, the wrapper (boxing, receiver binding, or `runBlocking` bridging) is wrong: debug the implementation, never the Java engine.

- [ ] **Step 3: Commit**

```bash
git add java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ExecuteIntegrationTest.kt
git commit -m "test(kotlin): end-to-end Execute integration incl. suspend handlers"
```

---

### Task 4: `parameterType` in the DSL

**Files:**
- Modify: `java/var-kotlin/src/main/kotlin/com/oselvar/varkt/DefineState.kt` (add one method to `StepsScope`)
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ParameterTypeTest.kt`

**Interfaces:**
- Consumes: `Registrar.defineParameterType(String, java.util.regex.Pattern, java.util.function.Function<Array<String>, T>)` (the `StepsScope` already holds the `registrar` field for exactly this).
- Produces: `StepsScope.parameterType(name: String, regexp: Regex, transformer: (Array<String>) -> Any?)`. Ordering contract (same as Java): declare before any step whose expression uses `{name}` — the registrar compiles each expression eagerly.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.core.Parse
import com.oselvar.`var`.core.Plan
import io.cucumber.cucumberexpressions.UndefinedParameterTypeException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ParameterTypeTest {

    data class Ctx(val color: String = "")

    @Test
    fun `custom parameter type transforms captures before the handler sees them`() {
        val registrar = RegistryRegistrar()
        defineState(::Ctx) {
            parameterType("color", Regex("red|green|blue")) { captures -> captures[0].uppercase() }
            action("I pick {color}") { c: String -> copy(color = c) }
        }.defineSteps(registrar)

        val plan = Plan.plan(
            Parse.parse("colors.md", "# Colors\n\n## Picking\n\nI pick red.\n"),
            registrar.registry(),
        )
        assertEquals(listOf<Any>("RED"), plan.examples()[0].steps()[0].args())
    }

    @Test
    fun `a step using a not-yet-declared parameter type fails at replay with the cucumber error`() {
        val registrar = RegistryRegistrar()
        val definitions = defineState(::Ctx) {
            action("I pick {color}") { c: String -> copy(color = c) }
            parameterType("color", Regex("red|green|blue")) { captures -> captures[0] }
        }
        assertThrows(UndefinedParameterTypeException::class.java) {
            definitions.defineSteps(registrar)
        }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test -Dtest=ParameterTypeTest`
Expected: FAIL — compile error, `parameterType` unresolved on `StepsScope`.

- [ ] **Step 3: Implement**

Add to `StepsScope` (after the `sensor` overloads), plus `import java.util.function.Function` at the top of `DefineState.kt`:

```kotlin
    /**
     * Registers a custom cucumber-expression parameter type. Must appear BEFORE
     * any step whose expression uses `{name}` — the underlying registrar
     * compiles each expression eagerly against the types registered so far
     * (same ordering rule as the Java author API).
     */
    fun parameterType(name: String, regexp: Regex, transformer: (Array<String>) -> Any?) {
        registrar.defineParameterType(
            name,
            regexp.toPattern(),
            Function<Array<String>, Any?> { captures -> transformer(captures) },
        )
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add java/var-kotlin/src/main/kotlin/com/oselvar/varkt/DefineState.kt java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ParameterTypeTest.kt
git commit -m "feat(kotlin): parameterType registration in the defineState DSL"
```

---

### Task 5: `StepLoader` accepts static factory methods (Java, Kotlin-agnostic)

A compiled top-level `val steps` lives on a file-facade class that does NOT implement `StepDefinitions` — it exposes a public static no-arg `getSteps()` returning one. Generalize `StepLoader` with plain reflection (meaningful for any JVM language), and close the latent silent-overwrite when two `defineState` registrations share one source file.

**Files:**
- Modify: `java/var-runner/src/main/java/com/oselvar/var/runner/StepLoader.java`
- Test (create): `java/var-runner/src/test/java/com/oselvar/var/runner/StaticFactorySteps.java`
- Test (create): `java/var-runner/src/test/java/com/oselvar/var/runner/DuplicateStateSteps.java`
- Test (create): `java/var-runner/src/test/java/com/oselvar/var/runner/StepLoaderStaticFactoryTest.java`

**Interfaces:**
- Consumes: existing `StepLoader.loadSteps(List<String>, ClassLoader)` / `LoadedSteps(registry, createContext)`.
- Produces: same signature, extended resolution — a configured class either (a) implements `StepDefinitions` (instantiated, unchanged), or (b) exposes ≥1 public static no-arg method whose return type is assignable to `StepDefinitions` (each invoked, name-sorted for determinism; every returned instance = one load unit with its own fresh `RegistryRegistrar`). Neither → `IllegalArgumentException` mentioning both options. Two load units whose steps report the same `expressionSourceFile` → `IllegalArgumentException` ("one defineState per step-definition file"). Tasks 6–9 rely on (b).

- [ ] **Step 1: Write the failing tests**

`java/var-runner/src/test/java/com/oselvar/var/runner/StaticFactorySteps.java`:

```java
package com.oselvar.var.runner;

import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Fixture for StepLoader's static-factory path: does NOT implement
 * StepDefinitions; exposes a public static no-arg factory instead — the plain-
 * Java shape of what a Kotlin top-level `val steps = defineState(...) {...}`
 * compiles to (a file-facade class with a static getSteps()).
 */
public final class StaticFactorySteps {

    private StaticFactorySteps() {}

    record Ctx() implements State {}

    public static StepDefinitions steps() {
        return registrar -> {
            StateBinder<Ctx> s = registrar.defineState(Ctx::new);
            s.action("I do a static-factory thing", (Ctx ctx) -> ctx);
        };
    }
}
```

`java/var-runner/src/test/java/com/oselvar/var/runner/DuplicateStateSteps.java`:

```java
package com.oselvar.var.runner;

import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Two static factories in ONE source file: both load units' steps report the
 * same expressionSourceFile ("DuplicateStateSteps.java"), so their two state
 * factories would silently overwrite each other in the per-file context map —
 * StepLoader must reject this ("one defineState per step-definition file").
 */
public final class DuplicateStateSteps {

    private DuplicateStateSteps() {}

    record Ctx() implements State {}

    public static StepDefinitions first() {
        return registrar -> {
            StateBinder<Ctx> s = registrar.defineState(Ctx::new);
            s.action("the first duplicate-file step", (Ctx ctx) -> ctx);
        };
    }

    public static StepDefinitions second() {
        return registrar -> {
            StateBinder<Ctx> s = registrar.defineState(Ctx::new);
            s.action("the second duplicate-file step", (Ctx ctx) -> ctx);
        };
    }
}
```

`java/var-runner/src/test/java/com/oselvar/var/runner/StepLoaderStaticFactoryTest.java`:

```java
package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class StepLoaderStaticFactoryTest {

    private static final ClassLoader LOADER = StepLoaderStaticFactoryTest.class.getClassLoader();

    @Test
    void loadsAClassExposingAStaticStepDefinitionsFactory() {
        StepLoader.LoadedSteps loaded =
                StepLoader.loadSteps(
                        List.of("com.oselvar.var.runner.StaticFactorySteps"), LOADER);

        assertEquals(1, loaded.registry().steps().size());
        assertEquals(
                "I do a static-factory thing",
                loaded.registry().steps().get(0).expression());
        // The load unit's state factory is keyed by the fixture's source file.
        assertNotNull(loaded.createContext().apply("StaticFactorySteps.java"));
    }

    @Test
    void rejectsAClassThatIsNeitherImplementorNorFactory() {
        IllegalArgumentException e =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StepLoader.loadSteps(List.of("java.lang.String"), LOADER));
        assertTrue(e.getMessage().contains("StepDefinitions"), e.getMessage());
        assertTrue(e.getMessage().contains("static"), e.getMessage());
    }

    @Test
    void rejectsTwoDefineStateRegistrationsSharingOneSourceFile() {
        IllegalArgumentException e =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                StepLoader.loadSteps(
                                        List.of("com.oselvar.var.runner.DuplicateStateSteps"), LOADER));
        assertTrue(e.getMessage().contains("DuplicateStateSteps.java"), e.getMessage());
        assertTrue(e.getMessage().contains("one defineState"), e.getMessage());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mvn -f java/pom.xml -pl var-runner -am test -Dtest=StepLoaderStaticFactoryTest`
Expected: FAIL — `loadsAClassExposingAStaticStepDefinitionsFactory` and `rejectsAClassThatIsNeitherImplementorNorFactory` with the current "does not implement StepDefinitions" `IllegalArgumentException`; `rejectsTwoDefineStateRegistrationsSharingOneSourceFile` fails because the current code silently overwrites instead of throwing.

- [ ] **Step 3: Implement**

In `StepLoader.java`:

3a. Add imports `java.lang.reflect.Method`, `java.lang.reflect.Modifier`, `java.util.Comparator`.

3b. In `loadSteps`, replace the loop body's first line and the factory-map insertion:

```java
        for (String className : stepClassNames) {
            for (StepDefinitions instance : resolveUnits(className, loader)) {
                RegistryRegistrar registrar = new RegistryRegistrar();
                instance.defineSteps(registrar);

                Registry own = registrar.registry();
                if (parameterTypes == null) {
                    // (unchanged comment/code)
                    parameterTypes = own.parameterTypes();
                }
                for (Registry.StepRegistration step : own.steps()) {
                    requireNoDuplicate(mergedSteps, step);
                    mergedSteps.add(step);
                }

                if (!own.steps().isEmpty()) {
                    String file = own.steps().get(0).expressionSourceFile();
                    if (factoriesByFile.containsKey(file)) {
                        throw new IllegalArgumentException(
                                "more than one defineState registration reports the step-definition file \""
                                        + file
                                        + "\" (one defineState per step-definition file; loaded classes: "
                                        + stepClassNames
                                        + ")");
                    }
                    factoriesByFile.put(file, registrar.stateFactory());
                }
                // else: unchanged comment about context-only classes.
            }
        }
```

3c. Replace `instantiate(String, ClassLoader)` with:

```java
    /**
     * Resolves one configured class name to its step-definition load units.
     * Either the class implements {@link StepDefinitions} (instantiated via its
     * no-arg constructor — the original path), or it exposes public static
     * no-arg methods whose return type is assignable to {@link StepDefinitions}
     * (each invoked; name-sorted for determinism). The static-factory shape is
     * what a Kotlin top-level {@code val steps = defineState(...) {...}}
     * compiles to (a file-facade class with a static getter), but the check is
     * plain reflection — nothing Kotlin-specific.
     */
    private static List<StepDefinitions> resolveUnits(String className, ClassLoader loader) {
        Class<?> rawClass;
        try {
            rawClass = Class.forName(className, true, loader);
        } catch (ClassNotFoundException e) {
            throw new IllegalArgumentException("step-definition class not found: " + className, e);
        }
        if (StepDefinitions.class.isAssignableFrom(rawClass)) {
            return List.of(instantiate(rawClass));
        }
        List<StepDefinitions> units = new ArrayList<>();
        List<Method> factories = new ArrayList<>();
        for (Method m : rawClass.getMethods()) {
            if (Modifier.isStatic(m.getModifiers())
                    && m.getParameterCount() == 0
                    && StepDefinitions.class.isAssignableFrom(m.getReturnType())) {
                factories.add(m);
            }
        }
        factories.sort(Comparator.comparing(Method::getName));
        for (Method factory : factories) {
            try {
                units.add((StepDefinitions) factory.invoke(null));
            } catch (IllegalAccessException | InvocationTargetException e) {
                throw new IllegalStateException(
                        "cannot invoke static step-definition factory " + factory, e);
            }
        }
        if (units.isEmpty()) {
            throw new IllegalArgumentException(
                    className
                            + " neither implements "
                            + StepDefinitions.class.getName()
                            + " nor exposes a public static no-arg method returning it");
        }
        return units;
    }

    private static StepDefinitions instantiate(Class<?> rawClass) {
        try {
            return (StepDefinitions) rawClass.getDeclaredConstructor().newInstance();
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(rawClass.getName() + " has no public no-arg constructor", e);
        } catch (InstantiationException | IllegalAccessException | InvocationTargetException e) {
            throw new IllegalStateException("cannot instantiate " + rawClass.getName(), e);
        }
    }
```

Update `loadSteps`'s javadoc `@throws IllegalArgumentException` line to mention the static-factory option and the one-defineState-per-file rule.

- [ ] **Step 4: Run the whole reactor's tests (existing `StepLoader` callers in var-runner AND var-junit must stay green)**

Run: `mvn -f java/pom.xml test`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add java/var-runner/src/main/java/com/oselvar/var/runner/StepLoader.java java/var-runner/src/test/java/com/oselvar/var/runner/StaticFactorySteps.java java/var-runner/src/test/java/com/oselvar/var/runner/DuplicateStateSteps.java java/var-runner/src/test/java/com/oselvar/var/runner/StepLoaderStaticFactoryTest.java
git commit -m "feat(java): StepLoader loads static StepDefinitions factories; reject duplicate per-file defineState"
```

---

### Task 6: Load a real Kotlin top-level `val` through `StepLoader`

**Files:**
- Modify: `java/var-kotlin/pom.xml` (add test-scoped `var-runner` dependency)
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/fixtures/cukes.steps.kt`
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/StepLoaderKotlinTest.kt`

**Interfaces:**
- Consumes: Task 5's generalized `StepLoader`; Task 2's `defineState`.
- Produces: the fixture `com.oselvar.varkt.fixtures.CukeSteps` (facade class of `cukes.steps.kt`, pinned by `@file:JvmName`) holding `val steps` — reused verbatim by Task 8's engine smoke.

- [ ] **Step 1: Add the dependency**

In `java/var-kotlin/pom.xml` `<dependencies>`:

```xml
    <dependency>
      <groupId>com.oselvar</groupId>
      <artifactId>var-runner</artifactId>
      <version>${project.version}</version>
      <scope>test</scope>
    </dependency>
```

- [ ] **Step 2: Write the fixture and the failing test**

`java/var-kotlin/src/test/kotlin/com/oselvar/varkt/fixtures/cukes.steps.kt` — the interview-approved file shape, verbatim:

```kotlin
@file:JvmName("CukeSteps")

package com.oselvar.varkt.fixtures

import com.oselvar.varkt.defineState

data class CukeCtx(val cukes: Int = 0)

val steps = defineState(::CukeCtx) {
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

`java/var-kotlin/src/test/kotlin/com/oselvar/varkt/StepLoaderKotlinTest.kt`:

```kotlin
package com.oselvar.varkt

import com.oselvar.`var`.runner.StepLoader
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StepLoaderKotlinTest {

    @Test
    fun `loads a top-level val steps via the file facade class`() {
        val loaded = StepLoader.loadSteps(
            listOf("com.oselvar.varkt.fixtures.CukeSteps"),
            javaClass.classLoader,
        )

        assertEquals(3, loaded.registry().steps().size)
        // Every step's location is the author's .steps.kt — the key the
        // executor uses to look up this file's state factory.
        assertTrue(loaded.registry().steps().all { it.expressionSourceFile() == "cukes.steps.kt" }) {
            loaded.registry().steps().map { it.expressionSourceFile() }.toString()
        }
        val state = loaded.createContext().apply("cukes.steps.kt")
        assertNotNull(state)
        assertTrue(state is StateBox<*>)
    }
}
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test -Dtest=StepLoaderKotlinTest`
Expected: PASS if Tasks 1–5 are correct (this is the integration point they exist for). If it fails on `expressionSourceFile` — the glue skip (Task 1) or the Kotlin lambda's frame attribution is wrong; if it fails to resolve `CukeSteps` — the `@file:JvmName` / facade-class assumption is wrong. Investigate against the failing assertion, do not adjust the assertion.

- [ ] **Step 4: Commit**

```bash
git add java/var-kotlin/pom.xml java/var-kotlin/src/test/kotlin/com/oselvar/varkt/fixtures/cukes.steps.kt java/var-kotlin/src/test/kotlin/com/oselvar/varkt/StepLoaderKotlinTest.kt
git commit -m "test(kotlin): top-level val steps loads through the generalized StepLoader"
```

---

### Task 7: Conformance fixtures (12 × `*.steps.kt`) + registry-stage gate

The spec's conformance scope: gate `registry.json` byte-for-byte through Kotlin fixtures. File names follow the shared stem rule directly (`numerals.steps.kt` → stem `numerals.steps` via plain extension-stripping — no `Conformance.fileStem` change needed, unlike Java's `NumeralsSteps.java` inverse-mapping). Fixtures use package `com.oselvar.varkt.conformance.bundleNN` (no back-ticked `var` segment) — the package does NOT need to match Java's fixture package; nothing keys on it.

**Files:**
- Modify: `java/var-kotlin/pom.xml` (test-compile `<sourceDirs>` adding the corpus)
- Create: `conformance/bundles/01-roman-numerals/numerals.steps.kt`
- Create: `conformance/bundles/02-context-isolation/counter.steps.kt`
- Create: `conformance/bundles/03-expected-failure/division.steps.kt`
- Create: `conformance/bundles/04-tables-and-docstrings/echo.steps.kt`
- Create: `conformance/bundles/05-ambiguous-match/cukes.steps.kt`
- Create: `conformance/bundles/06-doc-string-mismatch/echo.steps.kt`
- Create: `conformance/bundles/07-row-check-mismatch/report.steps.kt`
- Create: `conformance/bundles/08-string-capture/greet.steps.kt`
- Create: `conformance/bundles/09-expected-message-mismatch/boom.steps.kt`
- Create: `conformance/bundles/10-error-fence-without-step/cukes.steps.kt`
- Create: `conformance/bundles/11-emoji-offsets/greet.steps.kt`
- Create: `conformance/bundles/12-combining-marks/greet.steps.kt`
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ConformanceTest.kt`

**Interfaces:**
- Consumes: `com.oselvar.var.core.{Conformance.toRegistryArtifact, CanonicalJson.canonicalStringify}`; `RegistryRegistrar`; each bundle's committed `golden/registry.json`.
- Produces: per-bundle `val steps: StepDefinitions` in `com.oselvar.varkt.conformance.bundleNN`.

- [ ] **Step 1: Wire the corpus into var-kotlin's test compilation**

In `java/var-kotlin/pom.xml`, give the kotlin-maven-plugin's `test-compile` execution explicit source dirs (kotlinc-only — deliberately NOT `build-helper-maven-plugin`, which would also aim javac at the bundles and needlessly recompile the 12 `*Steps.java` fixtures into this module):

```xml
          <execution>
            <id>test-compile</id>
            <goals><goal>test-compile</goal></goals>
            <configuration>
              <sourceDirs>
                <sourceDir>${project.basedir}/src/test/kotlin</sourceDir>
                <!-- The shared, language-neutral conformance corpus (repo root).
                     kotlinc compiles only the *.steps.kt fixtures it finds there;
                     the sibling *.steps.ts/.py/.java and golden/*.json are ignored
                     (kotlinc reads .java for resolution only, emits nothing for it).
                     Same fixture-layout rationale as java/var/pom.xml's
                     build-helper block — see that comment for why fixture files
                     live in the corpus, not under src/. -->
                <sourceDir>${project.basedir}/../../conformance/bundles</sourceDir>
              </sourceDirs>
            </configuration>
          </execution>
```

- [ ] **Step 2: Write the failing test**

`java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ConformanceTest.kt` (mirrors `java/var`'s `ConformanceTest.registryMatchesGolden`; the fixture map is aliased imports of each bundle's `val steps` — explicit and compiler-checked, same rationale as Java's static switch):

```kotlin
package com.oselvar.varkt

import com.oselvar.`var`.RegistryRegistrar
import com.oselvar.`var`.StepDefinitions
import com.oselvar.`var`.core.CanonicalJson
import com.oselvar.`var`.core.Conformance
import com.oselvar.varkt.conformance.bundle01.steps as bundle01Steps
import com.oselvar.varkt.conformance.bundle02.steps as bundle02Steps
import com.oselvar.varkt.conformance.bundle03.steps as bundle03Steps
import com.oselvar.varkt.conformance.bundle04.steps as bundle04Steps
import com.oselvar.varkt.conformance.bundle05.steps as bundle05Steps
import com.oselvar.varkt.conformance.bundle06.steps as bundle06Steps
import com.oselvar.varkt.conformance.bundle07.steps as bundle07Steps
import com.oselvar.varkt.conformance.bundle08.steps as bundle08Steps
import com.oselvar.varkt.conformance.bundle09.steps as bundle09Steps
import com.oselvar.varkt.conformance.bundle10.steps as bundle10Steps
import com.oselvar.varkt.conformance.bundle11.steps as bundle11Steps
import com.oselvar.varkt.conformance.bundle12.steps as bundle12Steps
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Named
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

/**
 * The Kotlin facade's conformance gate — registry stage only, per the design
 * doc's interview-settled scope: parse/plan/trace stay proven by the Java
 * engine's own green corpus; what needs proving here is that the Kotlin DSL
 * registers the exact same expressions and parameter types.
 */
class ConformanceTest {

    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    fun `registry matches golden`(bundle: Path) {
        val fixture = loadFixture(bundle.fileName.toString())
        val registrar = RegistryRegistrar()
        fixture.defineSteps(registrar)

        val actual = CanonicalJson.canonicalStringify(
            Conformance.toRegistryArtifact(registrar.registry()),
        )
        val expected = Files.readString(
            bundle.resolve("golden").resolve("registry.json"),
            StandardCharsets.UTF_8,
        )
        assertEquals(expected, actual) { "${bundle.fileName}/registry.json mismatch" }
    }

    companion object {
        // Maven runs tests with the module directory (java/var-kotlin/) as the
        // working directory; the shared corpus is two levels up, same as
        // java/var's own ConformanceTest.
        private val BUNDLES_DIR: Path = Paths.get("..", "..", "conformance", "bundles")

        @JvmStatic
        fun bundleDirs(): List<Named<Path>> {
            assertTrue(Files.isDirectory(BUNDLES_DIR)) {
                "Expected conformance corpus at ${BUNDLES_DIR.toAbsolutePath()}"
            }
            Files.list(BUNDLES_DIR).use { entries ->
                return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map { dir -> Named.of(dir.fileName.toString(), dir) }
                    .toList()
            }
        }

        private fun loadFixture(bundleName: String): StepDefinitions = when (bundleName) {
            "01-roman-numerals" -> bundle01Steps
            "02-context-isolation" -> bundle02Steps
            "03-expected-failure" -> bundle03Steps
            "04-tables-and-docstrings" -> bundle04Steps
            "05-ambiguous-match" -> bundle05Steps
            "06-doc-string-mismatch" -> bundle06Steps
            "07-row-check-mismatch" -> bundle07Steps
            "08-string-capture" -> bundle08Steps
            "09-expected-message-mismatch" -> bundle09Steps
            "10-error-fence-without-step" -> bundle10Steps
            "11-emoji-offsets" -> bundle11Steps
            "12-combining-marks" -> bundle12Steps
            else -> throw IllegalStateException("No Kotlin step fixture registered for bundle $bundleName")
        }
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test -Dtest=ConformanceTest`
Expected: FAIL — unresolved `com.oselvar.varkt.conformance.bundle01.steps` etc. (fixtures don't exist yet).

- [ ] **Step 4: Author the 12 fixtures**

Each is the Kotlin sibling of the bundle's existing `.steps.ts`/`.steps.py`/`*Steps.java`, registering identical expressions in identical order with behaviorally-equivalent handlers (handler bodies matter for a possible future trace gate; the registry gate checks expressions + parameter types). Every file: `@file:JvmName` pinning a deterministic facade class, `package com.oselvar.varkt.conformance.bundleNN`, one public `val steps`.

`conformance/bundles/01-roman-numerals/numerals.steps.kt`:

```kotlin
@file:JvmName("NumeralsSteps")

// Kotlin sibling of numerals.steps.ts / numerals.steps.py / NumeralsSteps.java
// (bundle 01-roman-numerals). Unlike the Java fixture, the file keeps the
// shared cross-language stem naming (numerals.steps.kt -> "numerals.steps" by
// plain extension-stripping) — Kotlin has no file-name/class-name coupling, so
// no PascalCase workaround is needed; @file:JvmName pins the facade class the
// harness loads instead.
package com.oselvar.varkt.conformance.bundle01

import com.oselvar.varkt.defineState

data class Ctx(val result: String? = null)

private val ROMAN = mapOf(1 to "I", 4 to "IV", 9 to "IX", 40 to "XL")

val steps = defineState(::Ctx) {
    action("I convert {int} to roman numerals") { n: Int ->
        copy(result = ROMAN[n])
    }
    sensor("The result is {word}") { expected: String ->
        // {word} greedily captures trailing punctuation ("I."), mirroring the
        // TS/Java fixtures: strip it, assert directly, and return null to opt
        // out of the compare-against-last-captured-param convenience (which
        // would wrongly compare the raw punctuated capture).
        val cleaned = expected.replace(Regex("[.!?]$"), "")
        if (cleaned != result) throw AssertionError("expected $cleaned but got $result")
        null
    }
}
```

`conformance/bundles/02-context-isolation/counter.steps.kt`:

```kotlin
@file:JvmName("CounterSteps")

// Kotlin sibling of counter.steps.ts / counter.steps.py / CounterSteps.java
// (bundle 02-context-isolation).
package com.oselvar.varkt.conformance.bundle02

import com.oselvar.varkt.defineState

data class Ctx(val count: Int = 0)

val steps = defineState(::Ctx) {
    action("I increment") { copy(count = count + 1) }
    sensor("The count is {int}") { n: Int -> count }
}
```

`conformance/bundles/03-expected-failure/division.steps.kt`:

```kotlin
@file:JvmName("DivisionSteps")

// Kotlin sibling of division.steps.ts / division.steps.py / DivisionSteps.java
// (bundle 03-expected-failure).
package com.oselvar.varkt.conformance.bundle03

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I divide {int} by {int}") { a: Int, b: Int ->
        if (b == 0) throw ArithmeticException("division by zero")
        this
    }
}
```

`conformance/bundles/04-tables-and-docstrings/echo.steps.kt`:

```kotlin
@file:JvmName("EchoSteps")

// Kotlin sibling of echo.steps.ts / echo.steps.py / EchoSteps.java (bundle
// 04-tables-and-docstrings): the doc string arrives as the trailing handler
// argument after the expression's own captures (here: none) and is echoed back
// for the core's doc-string comparison.
package com.oselvar.varkt.conformance.bundle04

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    sensor("I echo the following:") { doc: String -> doc }
}
```

`conformance/bundles/05-ambiguous-match/cukes.steps.kt`:

```kotlin
@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 05-ambiguous-match): both expressions match "I have 5 cukes" -> ambiguous-
// match diagnostic at the plan stage; this stage only needs both registered.
package com.oselvar.varkt.conformance.bundle05

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I have {int} cukes") { n: Int -> this }
    action("I have 5 cukes") { this }
}
```

`conformance/bundles/06-doc-string-mismatch/echo.steps.kt`:

```kotlin
@file:JvmName("EchoSteps")

// Kotlin sibling of echo.steps.ts / echo.steps.py / EchoSteps.java (bundle
// 06-doc-string-mismatch): deliberately returns the WRONG string so the core's
// doc-string comparison fails at the trace stage.
package com.oselvar.varkt.conformance.bundle06

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    sensor("I echo the following:") { doc: String -> "goodbye" }
}
```

`conformance/bundles/07-row-check-mismatch/report.steps.kt`:

```kotlin
@file:JvmName("ReportSteps")

// Kotlin sibling of report.steps.ts / report.steps.py / ReportSteps.java
// (bundle 07-row-check-mismatch): header-bound row step — receives the current
// row (Map keyed by header cell) as the trailing argument and returns hardcoded
// (wrong) columns, producing a cell mismatch at the trace stage.
package com.oselvar.varkt.conformance.bundle07

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    sensor("I report the score and grade") { row: Map<String, String> ->
        mapOf("score" to "99", "grade" to "A")
    }
}
```

`conformance/bundles/08-string-capture/greet.steps.kt`:

```kotlin
@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 08-string-capture).
package com.oselvar.varkt.conformance.bundle08

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I greet {string}") { name: String -> this }
}
```

`conformance/bundles/09-expected-message-mismatch/boom.steps.kt`:

```kotlin
@file:JvmName("BoomSteps")

// Kotlin sibling of boom.steps.ts / boom.steps.py / BoomSteps.java (bundle
// 09-expected-message-mismatch): throws a message NOT containing the expected
// substring, so the error fence is not satisfied at the trace stage.
package com.oselvar.varkt.conformance.bundle09

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I always boom") {
        throw RuntimeException("actual different error")
    }
}
```

`conformance/bundles/10-error-fence-without-step/cukes.steps.kt`:

```kotlin
@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 10-error-fence-without-step): the example's prose matches no step, so the
// error fence has nothing to run — a plan-stage diagnostic; this stage only
// needs the one step registered.
package com.oselvar.varkt.conformance.bundle10

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    action("I have {int} cukes") { n: Int -> this }
}
```

`conformance/bundles/11-emoji-offsets/greet.steps.kt`:

```kotlin
@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 11-emoji-offsets): the example's non-header-bound trailing table arrives as
// the trailing argument after the {string} capture; the null return skips
// every comparison (mirrors TS's `() => undefined`).
package com.oselvar.varkt.conformance.bundle11

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    sensor("I greet {string}") { name: String, table: List<List<String>> -> null }
}
```

`conformance/bundles/12-combining-marks/greet.steps.kt`:

```kotlin
@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 12-combining-marks).
package com.oselvar.varkt.conformance.bundle12

import com.oselvar.varkt.defineState

class Ctx

val steps = defineState(::Ctx) {
    sensor("I greet {string}") { name: String -> null }
}
```

- [ ] **Step 5: Run the gate**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test -Dtest=ConformanceTest`
Expected: BUILD SUCCESS — 12 parameterized cases, each byte-for-byte equal to its `golden/registry.json`. A mismatch means the DSL altered an expression or parameter-type projection — fix the facade (or a fixture typo), never the golden.

- [ ] **Step 6: Run the whole module, then commit**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test`
Expected: BUILD SUCCESS.

```bash
git add java/var-kotlin/pom.xml java/var-kotlin/src/test/kotlin/com/oselvar/varkt/ConformanceTest.kt conformance/bundles/*/[a-z]*.steps.kt
git commit -m "feat(kotlin): registry-stage conformance gate with per-bundle steps.kt fixtures"
```

---

### Task 8: `var-junit` engine smoke with Kotlin-authored steps

**Files:**
- Modify: `java/var-kotlin/pom.xml` (test deps: `var-junit`, `junit-platform-testkit`)
- Test (create): `java/var-kotlin/src/test/kotlin/com/oselvar/varkt/JUnitEngineSmokeTest.kt`

**Interfaces:**
- Consumes: the `var` `TestEngine` (id `"var"`) via `EngineTestKit`; config keys `var.vars.include` (comma-separated globs / paths) + `var.steps` (FQCNs); `DiscoverySelectors.selectFile`; Task 6's fixture `com.oselvar.varkt.fixtures.CukeSteps` (pattern copied from `var-junit`'s `ConformanceDogfoodTest`).
- Produces: proof the unmodified JUnit engine drives Kotlin-authored steps.

- [ ] **Step 1: Add the test dependencies**

In `java/var-kotlin/pom.xml` `<dependencies>`:

```xml
    <dependency>
      <groupId>com.oselvar</groupId>
      <artifactId>var-junit</artifactId>
      <version>${project.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.platform</groupId>
      <artifactId>junit-platform-testkit</artifactId>
      <scope>test</scope>
    </dependency>
```

(version of the testkit comes from the parent's `junit-bom` import.)

- [ ] **Step 2: Write the failing test**

`java/var-kotlin/src/test/kotlin/com/oselvar/varkt/JUnitEngineSmokeTest.kt`:

```kotlin
package com.oselvar.varkt

import java.nio.file.Files
import java.nio.file.Path
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.junit.platform.engine.discovery.DiscoverySelectors.selectFile
import org.junit.platform.testkit.engine.EngineTestKit

/**
 * End-to-end smoke: the UNMODIFIED var-junit TestEngine discovers a real .md
 * spec and executes Kotlin-authored steps (Task 6's top-level-val fixture,
 * loaded through Task 5's StepLoader generalization). Same EngineTestKit +
 * selectFile pattern as var-junit's ConformanceDogfoodTest.
 */
class JUnitEngineSmokeTest {

    private fun runSpec(dir: Path, body: String) =
        Files.writeString(dir.resolve("cukes.md"), body).let { spec ->
            EngineTestKit.engine("var")
                .selectors(selectFile(spec.toFile()))
                .configurationParameter("var.vars.include", spec.toString().replace('\\', '/'))
                .configurationParameter("var.steps", "com.oselvar.varkt.fixtures.CukeSteps")
                .execute()
        }

    @Test
    fun `a passing example authored against Kotlin steps succeeds`(@TempDir dir: Path) {
        val results = runSpec(dir, "# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 5 cukes left.\n")
        assertEquals(1, results.testEvents().succeeded().count())
        assertEquals(0, results.testEvents().failed().count())
    }

    @Test
    fun `a mismatching sensor fails the example through the engine`(@TempDir dir: Path) {
        val results = runSpec(dir, "# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 99 cukes left.\n")
        assertEquals(0, results.testEvents().succeeded().count())
        assertEquals(1, results.testEvents().failed().count())
    }
}
```

- [ ] **Step 3: Run the test to verify the outcome**

Run: `mvn -f java/pom.xml -pl var-kotlin -am test -Dtest=JUnitEngineSmokeTest`
Expected: PASS (integration of already-proven parts). A `selectFile`-vs-`var.vars.include` resolution failure would show as 0 test events — check `VarFileSelectorResolver`'s relativization notes in `ConformanceDogfoodTest`'s javadoc before touching any engine code (the engine relativizes against the module working directory, `java/var-kotlin/`; an absolute `@TempDir` path in `var.vars.include` is matched as written by `Discovery` only when relativization applies — if the include glob doesn't match, use the spec's absolute path exactly as `ConformanceDogfoodTest` passes its relative one, i.e. mirror whatever string `selectFile` received).

- [ ] **Step 4: Commit**

```bash
git add java/var-kotlin/pom.xml java/var-kotlin/src/test/kotlin/com/oselvar/varkt/JUnitEngineSmokeTest.kt
git commit -m "test(kotlin): var-junit engine drives Kotlin-authored steps end to end"
```

---

### Task 9: `var-kotest` module — `VarSpec`

**Files:**
- Modify: `java/pom.xml` (add `<module>var-kotest</module>`)
- Create: `java/var-kotest/pom.xml`
- Create: `java/var-kotest/src/main/kotlin/com/oselvar/varkt/kotest/VarSpec.kt`
- Test (create): `java/var-kotest/src/test/kotlin/com/oselvar/varkt/kotest/fixtures/smoke.steps.kt`
- Test (create): `java/var-kotest/src/test/resources/kotest-smoke/specs/cukes.md`
- Test (create): `java/var-kotest/src/test/kotlin/com/oselvar/varkt/kotest/VarSpecSmokeTest.kt`

**Interfaces:**
- Consumes: `VarConfig.fromLookup(Function<String, Optional<String>>)`; `Discovery.findSpecs(include, exclude, root)`; `StepLoader.loadSteps`; `Run.planSpec` / `Run.examplesWithRuns` / `Run.RecordingReporter`; `Render.renderFailure(Throwable, String source, String path)`; Kotest 6 `FunSpec` (`context("…") { test("…") { … } }` registered from `init`).
- Produces: `abstract class VarSpec(root: Path = Path.of("."), lookup: (String) -> String? = { System.getProperty(it) }) : FunSpec()` — subclass it, point config at your specs/steps, done. One Kotest container per spec file, one test per planned example. No per-example fixture lifecycle, no diagnostics surfacing in v1 (explicit defers, per the design doc).

- [ ] **Step 1: Wire the module**

1a. `java/pom.xml` `<modules>` — after `<module>var-kotlin</module>`:

```xml
    <module>var-kotest</module>
```

1b. `java/var-kotest/pom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>com.oselvar</groupId>
    <artifactId>var-parent</artifactId>
    <version>0.0.0</version>
  </parent>

  <artifactId>var-kotest</artifactId>
  <packaging>jar</packaging>
  <name>var (Kotlin) — Kotest adapter</name>
  <description>
    Runs var specs as Kotest tests: subclass VarSpec, one Kotest test per
    planned example. Delegates discovery/loading/planning wholesale to
    var-runner; no pipeline logic here.
  </description>

  <dependencies>
    <dependency>
      <groupId>com.oselvar</groupId>
      <artifactId>var-kotlin</artifactId>
      <version>${project.version}</version>
    </dependency>
    <dependency>
      <groupId>com.oselvar</groupId>
      <artifactId>var-runner</artifactId>
      <version>${project.version}</version>
    </dependency>
    <dependency>
      <groupId>org.jetbrains.kotlin</groupId>
      <artifactId>kotlin-stdlib</artifactId>
      <version>${kotlin.version}</version>
    </dependency>
    <!-- Compile scope, not test: VarSpec extends FunSpec, so the adapter's
         whole public surface is Kotest types. -->
    <dependency>
      <groupId>io.kotest</groupId>
      <artifactId>kotest-runner-junit5-jvm</artifactId>
      <version>${kotest.version}</version>
    </dependency>
  </dependencies>

  <build>
    <sourceDirectory>src/main/kotlin</sourceDirectory>
    <testSourceDirectory>src/test/kotlin</testSourceDirectory>
    <plugins>
      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>${kotlin.version}</version>
        <executions>
          <execution>
            <id>compile</id>
            <goals><goal>compile</goal></goals>
          </execution>
          <execution>
            <id>test-compile</id>
            <goals><goal>test-compile</goal></goals>
          </execution>
        </executions>
        <configuration>
          <jvmTarget>21</jvmTarget>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 2: Write the failing test (fixture + spec + spec class)**

`java/var-kotest/src/test/kotlin/com/oselvar/varkt/kotest/fixtures/smoke.steps.kt`:

```kotlin
@file:JvmName("SmokeSteps")

package com.oselvar.varkt.kotest.fixtures

import com.oselvar.varkt.defineState

data class SmokeCtx(val cukes: Int = 0)

val steps = defineState(::SmokeCtx) {
    context("I have {int} cukes") { n: Int -> copy(cukes = n) }
    action("I eat {int} cukes") { n: Int -> copy(cukes = cukes - n) }
    sensor("I should have {int} cukes left") { cukes }
}
```

`java/var-kotest/src/test/resources/kotest-smoke/specs/cukes.md`:

```markdown
# Cukes

## Eating cukes

I have 8 cukes. I eat 3 cukes. I should have 5 cukes left.
```

`java/var-kotest/src/test/kotlin/com/oselvar/varkt/kotest/VarSpecSmokeTest.kt` — the spec class IS the assertion: Kotest executes it, and if the example fails (or zero tests are discovered, guarded by the count check) the build fails:

```kotlin
package com.oselvar.varkt.kotest

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe
import java.nio.file.Path

private val SMOKE_CONFIG = mapOf(
    "var.vars.include" to "specs/**/*.md",
    "var.steps" to "com.oselvar.varkt.kotest.fixtures.SmokeSteps",
)

/** Executed by the Kotest engine under Surefire: one container (the spec file), one passing example. */
class VarSpecSmokeTest : VarSpec(
    root = Path.of("src/test/resources/kotest-smoke"),
    lookup = SMOKE_CONFIG::get,
)

/** Guards against a silent zero-tests-discovered pass. */
class VarSpecRegistrationTest : FunSpec({
    test("VarSpec registered one container with one example") {
        val spec = object : VarSpec(
            root = Path.of("src/test/resources/kotest-smoke"),
            lookup = SMOKE_CONFIG::get,
        ) {}
        val roots = spec.rootTests()
        roots.size shouldBe 1
        roots[0].name.name shouldBe "specs/cukes.md"
    }
})
```

Note: `rootTests()` is Kotest 6's accessor for a spec instance's registered root test cases; if the exact accessor differs in 6.2.1 (`rootTests()` vs `materializeRootTests()`), use whichever `io.kotest.core.spec.Spec` exposes — the assertion (1 root named `specs/cukes.md`) stays the same.

- [ ] **Step 3: Run to verify it fails**

Run: `mvn -f java/pom.xml -pl var-kotest -am test`
Expected: FAIL — `VarSpec` unresolved.

- [ ] **Step 4: Implement `VarSpec.kt`**

```kotlin
package com.oselvar.varkt.kotest

import com.oselvar.`var`.runner.Discovery
import com.oselvar.`var`.runner.Render
import com.oselvar.`var`.runner.Run
import com.oselvar.`var`.runner.StepLoader
import com.oselvar.`var`.runner.VarConfig
import io.kotest.core.spec.style.FunSpec
import java.nio.file.Files
import java.nio.file.Path
import java.util.Optional

/**
 * The Kotest adapter: subclass, point the three shared config keys
 * (var.vars.include / var.vars.exclude / var.steps — identical semantics to
 * var-junit's junit-platform.properties keys) at your specs and steps, and
 * every planned example becomes one Kotest test inside a per-spec-file
 * container. All discovery/loading/planning/failure-rendering is delegated to
 * var-runner — this class contains zero pipeline logic.
 *
 * v1 defers (matching var-pytest/var-junit): no per-example fixture lifecycle,
 * no plan-diagnostic surfacing.
 *
 * @param root the directory the include/exclude globs resolve against
 *     (defaults to the module working directory).
 * @param lookup config-key lookup (defaults to JVM system properties, the
 *     top precedence tier var-junit's ConfigurationParameters also reads).
 */
abstract class VarSpec(
    root: Path = Path.of("."),
    lookup: (String) -> String? = { key -> System.getProperty(key) },
) : FunSpec() {

    init {
        val config = VarConfig.fromLookup { key -> Optional.ofNullable(lookup(key)) }
        val loaded = StepLoader.loadSteps(config.steps(), javaClass.classLoader)
        for (specPath in Discovery.findSpecs(config.varsInclude(), config.varsExclude(), root)) {
            val rel = root.toAbsolutePath().normalize()
                .relativize(specPath.toAbsolutePath().normalize())
                .toString()
                .replace('\\', '/')
            val source = Files.readString(specPath)
            val plan = Run.planSpec(rel, source, loaded.registry())
            val runs = Run.examplesWithRuns(plan, loaded.createContext(), Run.RecordingReporter())
            context(rel) {
                for (exampleRun in runs) {
                    test(exampleRun.example().name()) {
                        try {
                            exampleRun.run().run()
                        } catch (failure: Throwable) {
                            // Reuse the runner's span-anchored rendering — never
                            // re-derive failure text in an adapter.
                            throw AssertionError(Render.renderFailure(failure, source, rel), failure)
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mvn -f java/pom.xml -pl var-kotest -am test`
Expected: BUILD SUCCESS — Surefire runs both the Kotest engine (`VarSpecSmokeTest`, `VarSpecRegistrationTest`) and any Jupiter tests.

**Risk note:** the parent's `junit-bom` (6.1.1) manages `org.junit.platform:*` versions, which overrides the platform version Kotest 6.2.1 was compiled against. If the Kotest engine fails to launch (e.g. `NoSuchMethodError` in `org.junit.platform.*`), do NOT downgrade the reactor: add explicit `junit-platform-engine`/`junit-platform-launcher` test-scope pins in `var-kotest`'s pom matching Kotest's own transitive requirement, and record the resolution in the pom comment.

- [ ] **Step 6: Commit**

```bash
git add java/pom.xml java/var-kotest
git commit -m "feat(kotest): var-kotest module with VarSpec adapter"
```

---

### Task 10: Full-reactor gate + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-kotlin-facade-design.md` (status line only)

- [ ] **Step 1: Run everything**

Run: `mvn -f java/pom.xml clean test`
Expected: BUILD SUCCESS across all six modules (`var-core`, `var`, `var-runner`, `var-junit`, `var-kotlin`, `var-kotest`).

- [ ] **Step 2: Update the spec status**

In `docs/superpowers/specs/2026-07-01-kotlin-facade-design.md`, change:

```markdown
Status: design
```

to:

```markdown
Status: implemented (see docs/superpowers/plans/2026-07-01-kotlin-facade.md)
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-01-kotlin-facade-design.md
git commit -m "docs: mark Kotlin facade design as implemented"
```

---

## Self-Review

- **Spec coverage:** engine-reuse decision (whole plan, no pipeline port anywhere); Maven layout (Tasks 2/9); JUnit reuse + Kotest (Tasks 8/9); approved API + receiver semantics + one-`defineState`-per-file (Tasks 2/5); replay-not-side-effect registration (Task 2 test 1); `StateBox` (Tasks 2/3/6); suspend via `runBlocking` (Task 3's `delay`); glue-frame source locations (Tasks 1/2/6); `parameterType` + ordering rule (Task 4); `StepLoader` static factories + `var.steps` unchanged (Tasks 5/6/8); registry-stage conformance with stem-compatible file names (Task 7); both spec risks are executable gates (Task 2 Step 5 spike; Task 1/2/6 location assertions); Kotest-vs-JUnit-6 platform risk carried to Task 9 Step 5.
- **Known judgment call, not a placeholder:** Kotest 6's exact root-test accessor name in Task 9's registration guard is flagged inline with the invariant to assert; everything else compiles as written or names the exact file/line it modifies.
- **Type consistency:** `defineState(factory: () -> C, block: StepsScope<C>.() -> Unit): StepDefinitions` and `StateBox<C>(val value: C)` are used identically in Tasks 2, 3, 6, 7, 8, 9; `StepLoader.loadSteps(List<String>, ClassLoader): LoadedSteps` unchanged across Tasks 5, 6, 9.
