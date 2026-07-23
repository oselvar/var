package dev.varar.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VarConfigTest {

    @Test
    void parsesAllKeys() {
        VarConfig config = VarConfig.parse("""
                {
                  "docs": { "include": ["specs/**/*.md"], "exclude": ["specs/wip/**"] },
                  "steps": ["**/*Steps.java"],
                  "snippets": { "java": "J" }
                }
                """, "varar.config.json");
        assertEquals(List.of("specs/**/*.md"), config.docsInclude());
        assertEquals(List.of("specs/wip/**"), config.docsExclude());
        assertEquals(List.of("**/*Steps.java"), config.steps());
        assertEquals(Map.of("java", "J"), config.snippets());
    }

    @Test
    void allKeysOptionalAndSchemaKeyIgnored() {
        assertEquals(VarConfig.empty(), VarConfig.parse("{ \"$schema\": \"x\" }", "varar.config.json"));
    }

    @Test
    void unknownKeyIsRejected() {
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class, () -> VarConfig.parse("{ \"vars\": {} }", "varar.config.json"));
        assertTrue(e.getMessage().contains("unknown key"), e.getMessage());
        assertTrue(e.getMessage().startsWith("varar.config.json"), e.getMessage());
    }

    @Test
    void wrongTypeIsRejected() {
        assertThrows(
                IllegalArgumentException.class, () -> VarConfig.parse("{ \"steps\": \"x\" }", "varar.config.json"));
        assertThrows(
                IllegalArgumentException.class,
                () -> VarConfig.parse("{ \"snippets\": { \"java\": 1 } }", "varar.config.json"));
    }

    @Test
    void loadReadsFileAndMissingFileIsEmpty(@TempDir Path dir) throws IOException {
        assertEquals(VarConfig.empty(), VarConfig.load(dir));
        Files.writeString(
                dir.resolve("varar.config.json"),
                "{ \"docs\": { \"include\": [\"**/*.md\"] } }",
                StandardCharsets.UTF_8);
        assertEquals(List.of("**/*.md"), VarConfig.load(dir).docsInclude());
    }

    @Test
    void recordIsImmutable() {
        VarConfig config = VarConfig.empty();
        assertThrows(UnsupportedOperationException.class, () -> config.steps().add("x"));
    }
}
