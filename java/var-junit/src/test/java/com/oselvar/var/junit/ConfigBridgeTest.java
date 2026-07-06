package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.oselvar.var.config.VarConfig;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.engine.ConfigurationParameters;

/**
 * Verifies {@link ConfigBridge#fromConfigurationParameters} is a faithful adapter from a real
 * {@link ConfigurationParameters} instance to {@link VarConfig#load} — no parsing logic of its
 * own (that stays in {@code var-config}, tested independently there).
 */
class ConfigBridgeTest {

    @Test
    void configRootKeyPointsAtTheWorkspaceHoldingVarConfigJson(@TempDir Path workspace) throws Exception {
        Files.writeString(workspace.resolve("var.config.json"), """
                {
                  "docs": {
                    "include": ["features/**/*.md", "more/**/*.md"],
                    "exclude": ["features/wip/**/*.md"]
                  },
                  "steps": ["steps/**/*.steps.ts"]
                }
                """, StandardCharsets.UTF_8);
        ConfigurationParameters params =
                new FakeConfigurationParameters(Map.of("var.config.root", workspace.toString()));

        VarConfig config = ConfigBridge.fromConfigurationParameters(params);

        assertEquals(
                new VarConfig(
                        List.of("features/**/*.md", "more/**/*.md"),
                        List.of("features/wip/**/*.md"),
                        List.of("steps/**/*.steps.ts"),
                        Map.of(),
                        List.of()),
                config);
    }

    @Test
    void missingConfigRootKeyDefaultsToTheEmptyConfigWhenTheWorkingDirectoryHasNoVarConfigJson() {
        // No var.config.root parameter is set, so ConfigBridge falls back to the JVM working
        // directory (java/var-junit under this module's own `mvn test`) -- which has no
        // var.config.json -- so VarConfig.load resolves to the empty config.
        ConfigurationParameters params = new FakeConfigurationParameters(Map.of());

        VarConfig config = ConfigBridge.fromConfigurationParameters(params);

        assertEquals(VarConfig.empty(), config);
    }

    /**
     * Minimal hand-rolled {@link ConfigurationParameters} test double — neither
     * {@code junit-platform-engine} nor {@code junit-platform-testkit} 6.1.1 ships one (verified
     * by decompiling both jars).
     */
    private record FakeConfigurationParameters(Map<String, String> values) implements ConfigurationParameters {

        @Override
        public Optional<String> get(String key) {
            return Optional.ofNullable(values.get(key));
        }

        @Override
        public Optional<Boolean> getBoolean(String key) {
            return get(key).map(Boolean::parseBoolean);
        }

        @Override
        public Set<String> keySet() {
            return values.keySet();
        }
    }
}
