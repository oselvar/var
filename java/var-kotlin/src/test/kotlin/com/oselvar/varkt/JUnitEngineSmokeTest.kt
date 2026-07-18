package com.oselvar.varkt

import com.oselvar.`var`.junit.ConfigBridge
import java.nio.file.Files
import java.nio.file.Path
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.junit.platform.engine.discovery.DiscoverySelectors.selectFile
import org.junit.platform.testkit.engine.EngineTestKit

/**
 * End-to-end smoke: the UNMODIFIED var-junit TestEngine discovers a real .md spec and executes
 * Kotlin-authored steps (Task 6's top-level-val fixture, loaded through Task 5's StepLoader
 * generalization). Same EngineTestKit + selectFile pattern as var-junit's ConformanceDogfoodTest.
 */
class JUnitEngineSmokeTest {

    // VarFileSelectorResolver relativizes a FileSelector's path against the config root
    // (var.config.root) before testing it against docsInclude, so a spec written INTO the
    // workspace just needs the bare filename as its include. On macOS
    // DiscoverySelectors.selectFile(File) canonicalizes (resolving @TempDir's
    // /var -> /private/var symlink), so the root must be canonicalized the same way or the
    // relativization silently mismatches and discovery resolves zero test events.
    private fun runSpec(dir: Path, body: String) =
        Files.writeString(dir.resolve("cukes.md"), body).let { spec ->
            Files.writeString(
                dir.resolve("var.config.json"),
                """
                {
                  "docs": { "include": ["cukes.md"], "exclude": [] },
                  "steps": ["com.oselvar.varkt.fixtures.CukeSteps"]
                }
                """
                    .trimIndent(),
            )
            EngineTestKit.engine("var")
                .selectors(selectFile(spec.toFile()))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, dir.toRealPath().toString())
                .execute()
        }

    @Test
    fun `a passing example authored against Kotlin steps succeeds`(@TempDir dir: Path) {
        val results =
            runSpec(
                dir,
                "# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 5 cukes left.\n",
            )
        assertEquals(1, results.testEvents().succeeded().count())
        assertEquals(0, results.testEvents().failed().count())
    }

    @Test
    fun `a mismatching sensor fails the example through the engine`(@TempDir dir: Path) {
        val results =
            runSpec(
                dir,
                "# Cukes\n\n## Eating\n\nI have 8 cukes. I eat 3 cukes. I should have 99 cukes left.\n",
            )
        assertEquals(0, results.testEvents().succeeded().count())
        assertEquals(1, results.testEvents().failed().count())
    }
}
