package com.oselvar.varkt.kotest

import java.nio.file.Path
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.platform.engine.discovery.DiscoverySelectors.selectClass
import org.junit.platform.testkit.engine.EngineTestKit
import org.junit.platform.testkit.engine.EventConditions.event
import org.junit.platform.testkit.engine.EventConditions.finishedWithFailure
import org.junit.platform.testkit.engine.EventConditions.test
import org.junit.platform.testkit.engine.TestExecutionResultConditions.instanceOf
import org.junit.platform.testkit.engine.TestExecutionResultConditions.message

/**
 * Deliberately-failing spec driven ONLY programmatically by [VarSpecFailureTest] via EngineTestKit
 * — its name must not match Surefire's default *Test includes, or the red example would fail the
 * module's own build. Reuses the smoke fixture's steps: the sensor returns 5 while specs/wrong.md
 * claims 99. Config comes from `src/test/resources/kotest-failing/var.config.json`.
 */
class FailingVarSpec : VarSpec(root = Path.of("src/test/resources/kotest-failing"))

/**
 * Covers VarSpec's only nontrivial logic: the failing-example path, where the thrown failure is
 * wrapped in an AssertionError carrying var-runner's span-anchored rendering (Render.renderFailure)
 * with the original failure as cause. Also the empirical proof that a failing var example fails a
 * Kotest run (Surefire's console count for Kotest specs reads "Tests run: 0", so a green build
 * alone would not prove this).
 */
class VarSpecFailureTest {

    @Test
    fun `a failing example surfaces through the Kotest engine with the rendered failure`() {
        val results =
            EngineTestKit.engine("kotest")
                .selectors(selectClass(FailingVarSpec::class.java))
                .execute()

        // Kotest maps the per-file `context(rel)` container to a TEST-type
        // platform descriptor whose own outcome is SUCCESSFUL even when a
        // child example fails — so `succeeded()` is 1 (the container), not 0,
        // and the assertion that matters is: exactly one FAILED event, and it
        // is the example, carrying the rendered failure.
        assertEquals(
            1,
            results.testEvents().failed().count(),
            "expected exactly one failed example",
        )
        results
            .testEvents()
            .assertThatEvents()
            .haveExactly(
                1,
                event(
                    test(),
                    finishedWithFailure(
                        instanceOf(AssertionError::class.java),
                        // Render.renderFailure's span-anchored text, e.g.
                        // `line 5: expected "99", got "5"` — assert the stable
                        // parts, not the whole blob.
                        message { it.contains("expected \"99\"") && it.contains("got \"5\"") },
                    ),
                ),
            )
    }
}
