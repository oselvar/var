package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The Milestone 1 conformance gate: for every bundle under the shared, language-neutral
 * {@code conformance/bundles/} corpus, parses {@code example.md}, projects it via {@link
 * Conformance#toVarDocArtifact(Ast.VarDoc)}, serializes with {@link
 * CanonicalJson#canonicalStringify(Object)}, and asserts byte-for-byte equality with the
 * committed {@code golden/var-doc.json}.
 *
 * <p>Port of the var-doc stage of {@code typescript/packages/var/tests/conformance.test.ts}
 * and {@code python/packages/var/tests/test_conformance.py::test_var_doc_matches_golden}.
 * Plan/trace stages are later tasks (Milestones 3-4) — this class's golden-driven harness
 * only exercises var-doc; it also carries unit-level (non-golden) coverage of {@link
 * Conformance#toRegistryArtifact}/{@link Conformance#parameterTypeNames}, ported from
 * {@code conformance.test.ts}'s equivalent unit tests — the registry stage's own
 * golden-driven gate lives in {@code com.oselvar.var.ConformanceTest} (the {@code var}
 * module), since it needs a real Java step-definition fixture per bundle, authored against
 * the {@code var} module's {@code Registrar}/{@code StepDefinitions} API.
 *
 * <p>Each bundle is a separately reported {@code @ParameterizedTest} case (not one loop
 * hiding failures behind the first mismatch), keyed by directory name.
 */
class ConformanceTest {

    // Maven runs tests with the module directory (java/var-core/) as the working
    // directory, so the shared corpus — a sibling of java/, typescript/, python/ at the
    // repo root — is two levels up. Verified empirically: BUNDLES_DIR.toAbsolutePath()
    // resolves to .../conformance/bundles and bundleDirs() finds all 12 bundles.
    private static final Path BUNDLES_DIR = Paths.get("..", "..", "conformance", "bundles");

    // Wrapping each Path in Named<> (rather than returning a bare Stream<Path>) gives every
    // parameterized case its bundle directory name as its JUnit Platform display name — e.g.
    // "08-string-capture" instead of an opaque "[8]" (an IDE/JUnit Console Launcher run
    // renders this; Maven Surefire's own text/XML reports still index by number, but the
    // per-bundle assertion message below names the bundle either way).
    static Stream<Named<Path>> bundleDirs() throws IOException {
        assertTrue(
                Files.isDirectory(BUNDLES_DIR),
                () -> "Expected conformance corpus at " + BUNDLES_DIR.toAbsolutePath());
        try (Stream<Path> entries = Files.list(BUNDLES_DIR)) {
            return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map(dir -> Named.of(dir.getFileName().toString(), dir))
                    .toList()
                    .stream();
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("bundleDirs")
    void varDocMatchesGolden(Path bundle) throws IOException {
        String source = Files.readString(bundle.resolve("example.md"), StandardCharsets.UTF_8);
        Ast.VarDoc doc = Parse.parse("example.md", source);
        var artifact = Conformance.toVarDocArtifact(doc);
        String actual = CanonicalJson.canonicalStringify(artifact);
        String expected =
                Files.readString(bundle.resolve("golden").resolve("var-doc.json"), StandardCharsets.UTF_8);
        assertEquals(expected, actual, () -> bundle.getFileName() + "/var-doc.json mismatch");
    }

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    // Unit-level (not golden-driven) coverage of the registry projection, ported from
    // conformance.test.ts's "toRegistryArtifact lists expressions and parsed
    // parameter-type names" / "... ignoring escaped braces".

    @Test
    void toRegistryArtifactListsExpressionsAndParsedParameterTypeNames() {
        Registry r =
                Registry.addStep(
                        Registry.createRegistry(), "I have {int} cukes", "s.ts", 1, NOOP_HANDLER, null);

        var artifact = Conformance.toRegistryArtifact(r);
        assertEquals(List.of(), artifact.get("parameterTypes"));
        @SuppressWarnings("unchecked")
        var steps = (List<Object>) artifact.get("steps");
        assertEquals(1, steps.size());
        @SuppressWarnings("unchecked")
        var step = (Map<String, Object>) steps.get(0);
        assertEquals("I have {int} cukes", step.get("expression"));
        assertEquals(List.of("int"), step.get("parameterTypeNames"));
    }

    @Test
    void toRegistryArtifactReadsParameterNamesFromTheAstIgnoringEscapedBraces() {
        // A naive `{...}` regex would wrongly count the escaped `\{a, b\}` as a
        // parameter and yield ["a, b", "int"]; the AST sees only the real {int}.
        Registry r =
                Registry.addStep(
                        Registry.createRegistry(),
                        "the set \\{a, b\\} has {int} elements",
                        "s.ts",
                        1,
                        NOOP_HANDLER,
                        null);

        assertEquals(List.of("int"), Conformance.parameterTypeNames(r.steps().get(0).expression()));
    }
}
