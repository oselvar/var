package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.platform.engine.ConfigurationParameters;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;

/**
 * Empirically confirms {@link ConfigurationParameters}' real precedence order, rather than
 * trusting {@code docs/superpowers/specs/2026-07-01-java-junit-engine-design.md}'s original
 * stated assumption (system property → environment variable → {@code
 * junit-platform.properties} file).
 *
 * <p>Reading {@code org.junit.platform.launcher.core.LauncherConfigurationParameters}'s source
 * (6.1.1 sources jar) shows five provider tiers, checked in this order — first match wins:
 * explicit configuration parameters → explicitly-added configuration-parameter classpath
 * resources → a parent {@code ConfigurationParameters} (nested {@code Launcher}) → JVM system
 * properties → the {@code junit-platform.properties} classpath file. <strong>There is no
 * environment-variable tier at all</strong> — confirmed independently by {@link
 * ConfigurationParameters#get}'s own javadoc ("...an attempt will be made to look up the value
 * as a JVM system property. If no such system property exists, an attempt will be made to look
 * up the value in the [{@code junit-platform.properties}] file" — no mention of environment
 * variables anywhere in that interface).
 *
 * <p>This test empirically confirms the two tiers actually controllable in-process, without
 * forking a JVM: a JVM system property vs. a real {@code junit-platform.properties} classpath
 * file ({@code src/test/resources/junit-platform.properties}, scoped to a key —
 * {@code var.junit.configPrecedenceTest} — that no production code reads, so the file cannot
 * affect this module's own real {@code mvn test} run of the "var" engine, nor any other {@code
 * EngineTestKit}-based test in this module: {@code EngineTestKit}'s builder disables implicit
 * configuration parameters — system properties and this file — by default, per its own javadoc).
 *
 * <p><strong>The environment-variable tier is UNVERIFIED</strong>: mutating {@code
 * System.getenv()} in-process requires JDK-version-fragile reflection, which per the finding
 * above isn't needed anyway — there is no such tier in the real implementation to verify.
 */
class ConfigPrecedenceTest {

    private static final String KEY = "var.junit.configPrecedenceTest";

    @AfterEach
    void clearSystemProperty() {
        System.clearProperty(KEY);
    }

    @Test
    void propertiesFileWinsWhenNoSystemPropertyIsSet() {
        ConfigurationParameters params = realConfigurationParameters();

        assertEquals(
                Optional.of("from-junit-platform-properties-file"),
                params.get(KEY),
                "with no system property set, the junit-platform.properties classpath file value must win");
    }

    @Test
    void systemPropertyWinsOverThePropertiesFileWhenBothSetTheSameKey() {
        System.setProperty(KEY, "from-system-property");

        ConfigurationParameters params = realConfigurationParameters();

        assertEquals(
                Optional.of("from-system-property"),
                params.get(KEY),
                "a JVM system property must take precedence over the junit-platform.properties classpath file");
    }

    /**
     * Builds a real, implicit-providers-enabled {@link ConfigurationParameters} the same way the
     * real {@code Launcher} does for an ordinary {@code mvn test} run — {@code
     * LauncherDiscoveryRequestBuilder} leaves implicit configuration parameters enabled by
     * default (unlike {@code EngineTestKit}'s builder, which disables them), so this is the
     * lowest-level way to observe the real precedence without forking a JVM.
     */
    private static ConfigurationParameters realConfigurationParameters() {
        LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request().build();
        return request.getConfigurationParameters();
    }
}
