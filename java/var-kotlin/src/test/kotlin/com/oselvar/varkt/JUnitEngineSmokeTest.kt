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

    // VarFileSelectorResolver relativizes a FileSelector's path against the module's working
    // directory (Maven/Surefire's basedir) before testing it against var.vars.include (see its
    // javadoc + Discovery.matchSpec). @TempDir sits outside that basedir entirely, so the include
    // value must be the SAME relativized string the resolver itself computes -- and, on macOS,
    // DiscoverySelectors.selectFile canonicalizes the FileSelector's path (resolving the
    // /var -> /private/var symlink), while @TempDir's raw path does not, so this must relativize
    // the REAL (symlink-resolved) path, not just the absolute one, or matchSpec silently
    // mismatches and discovery resolves zero test events.
    private val moduleRoot: Path = Path.of("").toAbsolutePath().normalize().toRealPath()

    private fun runSpec(dir: Path, body: String) =
        Files.writeString(dir.resolve("cukes.md"), body).let { spec ->
            val relativeInclude = moduleRoot.relativize(spec.toRealPath()).toString().replace('\\', '/')
            EngineTestKit.engine("var")
                .selectors(selectFile(spec.toFile()))
                .configurationParameter("var.vars.include", relativeInclude)
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
