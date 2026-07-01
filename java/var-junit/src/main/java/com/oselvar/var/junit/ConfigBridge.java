package com.oselvar.var.junit;

import com.oselvar.var.runner.VarConfig;
import org.junit.platform.engine.ConfigurationParameters;

/**
 * Adapts JUnit Platform's {@link ConfigurationParameters} to the plain {@code
 * Function<String, Optional<String>>} lookup shape {@link VarConfig#fromLookup} expects, so
 * {@code var-runner} stays JUnit-agnostic while {@code var-junit} supplies the real
 * Platform-backed lookup.
 */
public final class ConfigBridge {

    private ConfigBridge() {}

    /** Builds a {@code VarConfig} by reading {@code var.vars.include}/{@code var.vars.exclude}/{@code var.steps} from {@code params}. */
    public static VarConfig fromConfigurationParameters(ConfigurationParameters params) {
        return VarConfig.fromLookup(params::get);
    }
}
