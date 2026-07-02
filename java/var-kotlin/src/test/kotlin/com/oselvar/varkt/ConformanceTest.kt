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
