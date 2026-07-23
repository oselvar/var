package dev.varar.kotlin

import dev.varar.StepDefinitions
import dev.varar.Steps
import dev.varar.core.CanonicalJson
import dev.varar.core.Conformance
import dev.varar.core.Parse
import dev.varar.kotlin.conformance.bundle01.steps as bundle01Steps
import dev.varar.kotlin.conformance.bundle02.steps as bundle02Steps
import dev.varar.kotlin.conformance.bundle03.steps as bundle03Steps
import dev.varar.kotlin.conformance.bundle04.steps as bundle04Steps
import dev.varar.kotlin.conformance.bundle05.steps as bundle05Steps
import dev.varar.kotlin.conformance.bundle06.steps as bundle06Steps
import dev.varar.kotlin.conformance.bundle07.steps as bundle07Steps
import dev.varar.kotlin.conformance.bundle08.steps as bundle08Steps
import dev.varar.kotlin.conformance.bundle09.steps as bundle09Steps
import dev.varar.kotlin.conformance.bundle10.steps as bundle10Steps
import dev.varar.kotlin.conformance.bundle11.steps as bundle11Steps
import dev.varar.kotlin.conformance.bundle12.steps as bundle12Steps
import dev.varar.kotlin.conformance.bundle13.steps as bundle13Steps
import dev.varar.kotlin.conformance.bundle14.steps as bundle14Steps
import dev.varar.kotlin.conformance.bundle15.steps as bundle15Steps
import dev.varar.kotlin.conformance.bundle16.steps as bundle16Steps
import dev.varar.kotlin.conformance.bundle17.steps as bundle17Steps
import dev.varar.kotlin.conformance.bundle18.steps as bundle18Steps
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
 * The Kotlin facade's conformance gate.
 *
 * The registry stage proves the Kotlin DSL registers the exact same expressions and parameter types
 * as its siblings. The trace stage proves the facade's *executor-facing* surface agrees too:
 * [StimulusAdapter]/[SensorAdapter], the `runBlocking` coroutine bridge, `StateBox`
 * boxing/unboxing, and arity-tolerant argument dropping are all Kotlin code the Java engine's own
 * green corpus never exercises. Parse and plan remain proven by the Java engine — those stages run
 * on identical inputs here and share the same implementation.
 */
class ConformanceTest {

    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    fun `registry matches golden`(bundle: Path) {
        val fixture = loadFixture(bundle.fileName.toString())
        val bound = Steps.bind(fixture)

        val actual =
            CanonicalJson.canonicalStringify(Conformance.toRegistryArtifact(bound.registry()))
        val expected =
            Files.readString(
                bundle.resolve("golden").resolve("registry.json"),
                StandardCharsets.UTF_8,
            )
        assertEquals(expected, actual) { "${bundle.fileName}/registry.json mismatch" }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    fun `trace matches golden`(bundle: Path) {
        val fixture = loadFixture(bundle.fileName.toString())
        val bound = Steps.bind(fixture)

        val source = Files.readString(bundle.resolve("example.md"), StandardCharsets.UTF_8)
        val doc = Parse.parse("example.md", source)
        val artifacts = Conformance.runConformance(doc, bound.registry(), bound.stateFactory())

        val actual = CanonicalJson.canonicalStringify(artifacts.trace())
        val expected =
            Files.readString(bundle.resolve("golden").resolve("trace.json"), StandardCharsets.UTF_8)
        assertEquals(expected, actual) { "${bundle.fileName}/trace.json mismatch" }
    }

    companion object {
        // Maven runs tests with the module directory (java/kotlin/) as the
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

        private fun loadFixture(bundleName: String): StepDefinitions<*> =
            when (bundleName) {
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
                "13-custom-parameter-type" -> bundle13Steps
                "14-stateless-steps" -> bundle14Steps
                "15-custom-parameter-format" -> bundle15Steps
                "16-stimulus-state-replacement" -> bundle16Steps
                "17-unexpected-pass" -> bundle17Steps
                "18-multi-table-example" -> bundle18Steps
                else ->
                    throw IllegalStateException(
                        "No Kotlin step fixture registered for bundle $bundleName"
                    )
            }
    }
}
