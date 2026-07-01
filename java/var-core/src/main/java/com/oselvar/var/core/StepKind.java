package com.oselvar.var.core;

/**
 * The role a step definition plays, mirroring {@code concepts/sensors-and-actuators.md}
 * (and {@code var-core/src/step-role.ts}'s {@code StepKind} union type):
 *
 * <ul>
 *   <li>{@link #CONTEXT} — the quiescent state the software rests in
 *   <li>{@link #ACTION} — the actuator: the single stimulus
 *   <li>{@link #SENSOR} — the read-only assertion (the only role that returns for
 *       comparison)
 * </ul>
 *
 * <p>Hoisted here from {@code com.oselvar.var} (Task 11's provisional home) per the
 * design doc's module map: step-role/registry logic belongs in {@code var-core} (the
 * engine), alongside {@link StepRole} and {@link Registry}.
 */
public enum StepKind {
    CONTEXT,
    ACTION,
    SENSOR
}
