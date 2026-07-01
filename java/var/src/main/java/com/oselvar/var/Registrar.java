package com.oselvar.var;

import java.util.function.Supplier;

/**
 * The sink a step-definition class registers into. Task 11 winning shape (Candidate B):
 * the runner passes a Registrar to {@link StepDefinitions#defineSteps} — there is no
 * global mutable accumulator and no reliance on static-initializer side effects.
 *
 * <p>This diverges deliberately from the TS/Python module-scope builder ({@code
 * internal.ts}'s {@code let steps = []}, {@code internal.py}'s {@code _steps}): those
 * work because Node/Python spin up a fresh process per run, so the module-level mutable
 * state is effectively run-scoped. A long-lived JVM (Surefire fork reuse, IDE runner,
 * Gradle daemon) has no such reset, making a static accumulator a genuine cross-run
 * leakage hazard. Threading a fresh Registrar per run keeps the mutable accumulation in
 * the imperative shell where CLAUDE.md's "functional core, imperative shell" wants it.
 *
 * <p>Preserves the semantics the design doc requires: one state factory per
 * step-definition class (one {@link #defineState} call), fresh per example (the runner
 * re-invokes the {@link Supplier}).
 */
public interface Registrar {

    /**
     * Register {@code factory} as this step file's initial-state constructor and return
     * the {@code context}/{@code action}/{@code sensor} binder bound to it.
     *
     * @param factory produces a fresh initial state per example
     * @param <C> the context-state type
     */
    <C extends State> StateBinder<C> defineState(Supplier<C> factory);

    // Task 12: <T> void defineParameterType(String name, Pattern regexp,
    //                                       Function<String[], T> transformer);
}
