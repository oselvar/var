package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
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
 * Registry/plan/trace stages are later tasks (Milestones 2-4) — this harness only exercises
 * var-doc.
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
}
