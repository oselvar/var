package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * Field semantics ported from {@code var_runner.config} (Python): same include/exclude/steps
 * rules across every language port — {@code include} has no default (empty discovers nothing),
 * {@code exclude} removes matches, plain globs (no {@code !} prefix). Unlike the Python port,
 * there is no TOML file here: {@link VarConfig#fromLookup} reads three single-string keys (each
 * possibly comma-separated) via a caller-supplied lookup function, so {@code var-junit} can adapt
 * {@code ConfigurationParameters::get} to it without this module ever depending on JUnit
 * Platform.
 */
class VarConfigTest {

    private static Function<String, Optional<String>> lookup(Map<String, String> values) {
        return key -> Optional.ofNullable(values.get(key));
    }

    @Test
    void parsesCommaSeparatedValuesIntoLists() {
        VarConfig config =
                VarConfig.fromLookup(
                        lookup(
                                Map.of(
                                        "var.vars.include", "features/**/*.md,more/**/*.md",
                                        "var.vars.exclude", "**/wip/**",
                                        "var.steps", "steps/**/*.steps.java,other/**/*.steps.java")));

        assertEquals(List.of("features/**/*.md", "more/**/*.md"), config.varsInclude());
        assertEquals(List.of("**/wip/**"), config.varsExclude());
        assertEquals(List.of("steps/**/*.steps.java", "other/**/*.steps.java"), config.steps());
    }

    @Test
    void allEmptyLookupYieldsAllEmptyListsNoDefaultInclude() {
        VarConfig config = VarConfig.fromLookup(lookup(Map.of()));

        assertEquals(List.of(), config.varsInclude());
        assertEquals(List.of(), config.varsExclude());
        assertEquals(List.of(), config.steps());
    }

    @Test
    void trimsWhitespaceAroundEntries() {
        VarConfig config =
                VarConfig.fromLookup(lookup(Map.of("var.vars.include", " features/**/*.md , more/**/*.md ")));

        assertEquals(List.of("features/**/*.md", "more/**/*.md"), config.varsInclude());
    }

    @Test
    void dropsEmptyEntriesFromTrailingComma() {
        VarConfig config =
                VarConfig.fromLookup(lookup(Map.of("var.vars.include", "features/**/*.md,,")));

        assertEquals(List.of("features/**/*.md"), config.varsInclude());
    }

    @Test
    void blankValueYieldsEmptyList() {
        VarConfig config = VarConfig.fromLookup(lookup(Map.of("var.vars.include", "   ")));

        assertEquals(List.of(), config.varsInclude());
    }

    @Test
    void recordDefensivelyCopiesListsAndRejectsMutation() {
        var mutable = new ArrayList<String>();
        mutable.add("a/**/*.md");
        VarConfig config = new VarConfig(mutable, List.of(), List.of());
        mutable.add("b/**/*.md");

        assertEquals(List.of("a/**/*.md"), config.varsInclude());
        assertThrows(UnsupportedOperationException.class, () -> config.varsInclude().add("x"));
    }
}
