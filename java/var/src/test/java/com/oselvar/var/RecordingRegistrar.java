package com.oselvar.var;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * A minimal in-memory {@link Registrar} used to prove the author API in tests. It records
 * each registration (with source location captured via {@link StackWalker}) instead of
 * compiling into a var-core Registry — that wiring is Task 12. Handlers are retained
 * type-erased as {@link Object}; execution is Task 18.
 */
final class RecordingRegistrar implements Registrar {

    record Registration(
            String expression, StepKind kind, Object handler, String sourceFile, int sourceLine) {}

    private final List<Registration> steps = new ArrayList<>();
    private final List<Supplier<? extends State>> factories = new ArrayList<>();

    List<Registration> steps() {
        return List.copyOf(steps);
    }

    List<Supplier<? extends State>> factories() {
        return List.copyOf(factories);
    }

    @Override
    public <C extends State> StateBinder<C> defineState(Supplier<C> factory) {
        factories.add(factory);
        return new Binder<>();
    }

    private void record(String expression, StepKind kind, Object handler) {
        StackWalker.StackFrame caller =
                StackWalker.getInstance()
                        .walk(
                                frames ->
                                        frames.filter(
                                                        f ->
                                                                !f.getClassName()
                                                                        .startsWith(
                                                                                RecordingRegistrar.class
                                                                                        .getName()))
                                                .findFirst()
                                                .orElseThrow());
        steps.add(
                new Registration(
                        expression, kind, handler, caller.getFileName(), caller.getLineNumber()));
    }

    private final class Binder<C extends State> implements StateBinder<C> {
        @Override
        public void context(String expression, Context0<C> handler) {
            record(expression, StepKind.CONTEXT, handler);
        }

        @Override
        public <A> void context(String expression, Context1<C, A> handler) {
            record(expression, StepKind.CONTEXT, handler);
        }

        @Override
        public void action(String expression, Context0<C> handler) {
            record(expression, StepKind.ACTION, handler);
        }

        @Override
        public <A> void action(String expression, Context1<C, A> handler) {
            record(expression, StepKind.ACTION, handler);
        }

        @Override
        public <R> void sensor(String expression, Sensor0<C, R> handler) {
            record(expression, StepKind.SENSOR, handler);
        }

        @Override
        public <A, R> void sensor(String expression, Sensor1<C, A, R> handler) {
            record(expression, StepKind.SENSOR, handler);
        }
    }
}
