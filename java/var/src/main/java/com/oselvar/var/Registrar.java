package com.oselvar.var;

import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * The sink a step-definition class registers into. Task 11 winning shape (Candidate B):
 * the runner passes a Registrar to {@link StepDefinitions#defineSteps} — there is no
 * global mutable accumulator and no reliance on static-initializer side effects.
 *
 * <p>This diverges deliberately from the TS/Python module-scope builder ({@code
 * internal.ts}'s {@code let steps = []}, {@code internal.py}'s {@code _steps}). Those
 * accumulators are not purely run-scoped either — they just usually get away with it
 * because Node/Python typically execute a whole test file as a fresh process — which is
 * why both ship a reset hatch ({@code _resetBuilder()} in {@code internal.ts}, {@code
 * _reset_builder()} in {@code internal.py}) "for use in tests between isolated
 * scenarios". Java's classloader lifetime is not the same as a run's lifetime, and this
 * is already live in this project: {@code var-junit} (the future JUnit Platform {@code
 * TestEngine}, per ADR 0003) runs in-process in the test JVM, where {@code
 * LauncherSession} reuse, {@code @RepeatedTest}, "rerun failed tests," and this
 * project's own unit test suite (many {@code @Test} methods, one classloader) all drive
 * more than one registration cycle through a single classloader. Relying on that reset
 * hatch constantly is easy to forget — a fresh {@link Registrar} injected per run avoids
 * needing it at all.
 *
 * <p>Independently of any JVM-specific argument, CLAUDE.md's "functional core,
 * imperative shell" / hexagonal-architecture rule settles this: mutable accumulation
 * belongs in a shell-owned adapter, never a global inside the pure facade. A static
 * accumulator here would violate that on principle regardless of what any particular
 * test runner does.
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

    /**
     * Registers a custom cucumber-expression parameter type, available to every step
     * subsequently compiled through this registrar — the facade-level equivalent of
     * {@code com.oselvar.var.core.Registry#defineParameterType}.
     *
     * @param name the {@code {name}} placeholder this type matches
     * @param regexp the pattern a placeholder occurrence must match
     * @param transformer maps the matched capture group(s) to the argument value a
     *     handler receives for this placeholder
     * @param <T> the type the transformer produces
     */
    <T> void defineParameterType(String name, Pattern regexp, Function<String[], T> transformer);
}
