package com.oselvar.var;

/**
 * The role a step plays. Mirrors {@code StepKind} in var-core (TS/Python).
 *
 * <p>Provisionally lives here in the author facade; Task 12 (Registry) may hoist it
 * into {@code com.oselvar.var.core} once that package gains a Registry type.
 */
public enum StepKind {
    CONTEXT,
    ACTION,
    SENSOR
}
