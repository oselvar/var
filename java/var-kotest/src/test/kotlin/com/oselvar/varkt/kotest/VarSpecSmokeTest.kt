package com.oselvar.varkt.kotest

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe
import java.nio.file.Path

private val SMOKE_CONFIG = mapOf(
    "var.vars.include" to "specs/**/*.md",
    "var.steps" to "com.oselvar.varkt.kotest.fixtures.SmokeSteps",
)

/**
 * Executed by the Kotest engine under Surefire: one container (the spec file),
 * one passing example. Note: Surefire's console summary shows "Tests run: 0"
 * for Kotest specs (a nested-test counting quirk); the surefire-reports XML
 * records the real per-example testcase, and a failing example still fails
 * the build (proven by VarSpecFailureTest).
 */
class VarSpecSmokeTest : VarSpec(
    root = Path.of("src/test/resources/kotest-smoke"),
    lookup = SMOKE_CONFIG::get,
)

/**
 * Guards against a silent zero-tests-discovered pass.
 *
 * Accessor note: the brief's `rootTests()` does not exist on Kotest 6.2.1's
 * `io.kotest.core.spec.Spec` — resolved empirically via `javap`/sources-jar on the
 * resolved `kotest-framework-engine-jvm:6.2.1` artifact. `Spec` declares `tests():
 * List<TestDefinition>` (implemented by `DslDrivenSpec`, the base FunSpec inherits
 * from); every root-level `context(...)`/`test(...)` call registers exactly one
 * `TestDefinition` via `add(...)` (see `DslDrivenSpec.add`). `TestDefinition.name` is a
 * `TestName`, whose `.name` is the raw name string as passed to `context(...)` — the
 * `FunSpecRootScope.contextName` prefix ("context ") is stored in `TestName.prefix`,
 * a SEPARATE field, and does not affect `.name`. So `spec.tests()[0].name.name` is
 * exactly `"specs/cukes.md"`, matching the brief's invariant with `tests()` swapped in
 * for the nonexistent `rootTests()`.
 */
class VarSpecRegistrationTest : FunSpec({
    test("VarSpec registered one container with one example") {
        val spec = object : VarSpec(
            root = Path.of("src/test/resources/kotest-smoke"),
            lookup = SMOKE_CONFIG::get,
        ) {}
        // tests() is @KotestInternal (@RequiresOptIn, WARNING level) — accepted
        // knowingly: it is the only accessor for a spec's registered roots, and
        // this guard's whole point is inspecting registration without running
        // the engine. The @OptIn keeps the build warning-free.
        @OptIn(io.kotest.common.KotestInternal::class)
        val roots = spec.tests()
        roots.size shouldBe 1
        roots[0].name.name shouldBe "specs/cukes.md"
    }
})
