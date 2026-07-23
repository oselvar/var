package dev.varar.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Shared config-conformance harness — see conformance/config/README.md. */
class ConfigConformanceTest {

    // Maven runs with java/config/ as the working directory; the corpus
    // is a repo-root sibling of java/, two levels up.
    private static final Path CASES_DIR = Paths.get("..", "..", "conformance", "config", "cases");

    static Stream<Named<Path>> cases() throws IOException {
        assertTrue(Files.isDirectory(CASES_DIR), () -> "Expected " + CASES_DIR.toAbsolutePath());
        try (Stream<Path> entries = Files.list(CASES_DIR)) {
            return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map(dir -> Named.of(dir.getFileName().toString(), dir))
                    .toList()
                    .stream();
        }
    }

    @ParameterizedTest
    @MethodSource("cases")
    void caseMatchesContract(Path caseDir) throws IOException {
        if (Files.exists(caseDir.resolve("expect-error.txt"))) {
            assertThrows(IllegalArgumentException.class, () -> VarConfig.load(caseDir));
            return;
        }
        VarConfig config = VarConfig.load(caseDir);
        Map<String, Object> docs = new LinkedHashMap<>();
        docs.put("include", config.docsInclude());
        docs.put("exclude", config.docsExclude());
        Map<String, Object> artifact = new LinkedHashMap<>();
        artifact.put("docs", docs);
        artifact.put("steps", config.steps());
        artifact.put("snippets", config.snippets());
        String actual = CanonicalJson.canonicalStringify(artifact);
        String expected = Files.readString(caseDir.resolve("golden.json"), StandardCharsets.UTF_8);
        assertEquals(expected, actual, () -> caseDir.getFileName() + " mismatch");
    }
}
