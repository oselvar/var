package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.oselvar.var.runner.VarConfig;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.platform.engine.ConfigurationParameters;

/**
 * Verifies {@link ConfigBridge#fromConfigurationParameters} is a faithful adapter from a real
 * {@link ConfigurationParameters} instance to {@link VarConfig#fromLookup} — no parsing logic of
 * its own (that stays in {@code VarConfig}, tested independently in var-runner).
 */
class ConfigBridgeTest {

    @Test
    void knownKeysProduceTheExpectedVarConfig() {
        ConfigurationParameters params =
                new FakeConfigurationParameters(
                        Map.of(
                                "var.vars.include", "features/**/*.md, more/**/*.md",
                                "var.vars.exclude", "features/wip/**/*.md",
                                "var.steps", "steps/**/*.steps.ts"));

        VarConfig config = ConfigBridge.fromConfigurationParameters(params);

        assertEquals(
                new VarConfig(
                        List.of("features/**/*.md", "more/**/*.md"),
                        List.of("features/wip/**/*.md"),
                        List.of("steps/**/*.steps.ts")),
                config);
    }

    @Test
    void missingKeysProduceEmptyLists() {
        ConfigurationParameters params = new FakeConfigurationParameters(Map.of());

        VarConfig config = ConfigBridge.fromConfigurationParameters(params);

        assertEquals(new VarConfig(List.of(), List.of(), List.of()), config);
    }

    /**
     * Minimal hand-rolled {@link ConfigurationParameters} test double — neither
     * {@code junit-platform-engine} nor {@code junit-platform-testkit} 6.1.1 ships one (verified
     * by decompiling both jars).
     */
    private record FakeConfigurationParameters(Map<String, String> values)
            implements ConfigurationParameters {

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
