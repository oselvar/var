package com.oselvar.var.runner;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * Runner-level configuration: which files are specs ({@code varsInclude}/{@code varsExclude})
 * and which are step definitions ({@code steps}) — port of {@code var_runner.config.VarConfig}
 * (Python), same field semantics as every other language port: {@code include} has no default
 * (empty discovers nothing), {@code exclude} removes matches, both are plain globs (no {@code !}
 * prefix).
 *
 * <p>Unlike the Python port, there is no {@code pyproject.toml}/TOML table to read here — Java
 * has no equivalent single config file. Instead {@link #fromLookup} reads three single-string
 * keys ({@code var.vars.include}, {@code var.vars.exclude}, {@code var.steps}) via a
 * caller-supplied lookup, matching the {@code junit-platform.properties} convention of
 * comma-separated values (e.g. {@code var.vars.include=features/**\/*.md,more/**\/*.md}).
 *
 * <p>The lookup is a plain {@code Function<String, Optional<String>>} rather than JUnit
 * Platform's {@code ConfigurationParameters} so this module never imports a JUnit-Platform type
 * — {@code var-junit} adapts {@code ConfigurationParameters::get} to this shape instead.
 */
public record VarConfig(List<String> varsInclude, List<String> varsExclude, List<String> steps) {

    private static final String INCLUDE_KEY = "var.vars.include";
    private static final String EXCLUDE_KEY = "var.vars.exclude";
    private static final String STEPS_KEY = "var.steps";

    public VarConfig {
        varsInclude = List.copyOf(varsInclude);
        varsExclude = List.copyOf(varsExclude);
        steps = List.copyOf(steps);
    }

    /**
     * Builds a {@code VarConfig} from a lookup function, reading {@code var.vars.include},
     * {@code var.vars.exclude}, and {@code var.steps}. Each value is split on comma, trimmed, and
     * empty entries are dropped; a missing key yields an empty list.
     */
    public static VarConfig fromLookup(Function<String, Optional<String>> lookup) {
        return new VarConfig(
                splitEntries(lookup.apply(INCLUDE_KEY)),
                splitEntries(lookup.apply(EXCLUDE_KEY)),
                splitEntries(lookup.apply(STEPS_KEY)));
    }

    private static List<String> splitEntries(Optional<String> value) {
        if (value.isEmpty()) return List.of();
        List<String> entries = new ArrayList<>();
        for (String entry : value.get().split(",")) {
            String trimmed = entry.trim();
            if (!trimmed.isEmpty()) entries.add(trimmed);
        }
        return List.copyOf(entries);
    }
}
