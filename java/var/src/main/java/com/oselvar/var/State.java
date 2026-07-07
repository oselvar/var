package com.oselvar.var;

/**
 * Marker for a step-definition class's evolving context state.
 *
 * <p>Task 11 decision: evolving state is a <strong>full-replacement immutable
 * value</strong>, not a shallow-merge of a partial return (unlike TS's {@code
 * Partial<C>} and Python's {@code dict}). Authors declare a {@code record … implements
 * State}; the factory returns the initial value and {@code context}/{@code action}
 * handlers return a <em>new, complete</em> state value. This keeps state typed,
 * IDE-navigable, and literally "updates produce a new value" (CLAUDE.md), at the cost
 * of reconstructing all fields when only one changes — deliberate divergence from the
 * other two languages. See doc/superpowers/specs/2026-07-01-java-core-port-design.md.
 */
public interface State {

    /**
     * The state of a step-definition class that declares none: what the factory-less
     * {@link Registrar#steps()} binds handlers to. A stimulus that has nothing to
     * evolve returns the instance it received; a sensor has no fields to read.
     */
    record Empty() implements State {
        public static final Empty INSTANCE = new Empty();
    }
}
