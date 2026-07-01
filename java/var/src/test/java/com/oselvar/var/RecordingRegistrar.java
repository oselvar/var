package com.oselvar.var;

import com.oselvar.var.core.StepKind;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * A minimal in-memory {@link Registrar} used to prove the author API in tests. It records
 * each registration (with source location captured via {@link StackWalker}) instead of
 * compiling into a var-core Registry — that wiring is Task 12. Handlers are retained
 * type-erased as {@link Object}; execution is Task 18.
 */
final class RecordingRegistrar implements Registrar {

    record Registration(
            String expression, StepKind kind, Object handler, String sourceFile, int sourceLine) {}

    record ParamTypeRegistration(String name, Pattern regexp, Function<String[], ?> transformer) {}

    private final List<Registration> steps = new ArrayList<>();
    private final List<Supplier<? extends State>> factories = new ArrayList<>();
    private final List<ParamTypeRegistration> paramTypes = new ArrayList<>();

    List<Registration> steps() {
        return List.copyOf(steps);
    }

    List<Supplier<? extends State>> factories() {
        return List.copyOf(factories);
    }

    List<ParamTypeRegistration> paramTypes() {
        return List.copyOf(paramTypes);
    }

    @Override
    public <C extends State> StateBinder<C> defineState(Supplier<C> factory) {
        factories.add(factory);
        return new Binder<>();
    }

    @Override
    public <T> void defineParameterType(String name, Pattern regexp, Function<String[], T> transformer) {
        paramTypes.add(new ParamTypeRegistration(name, regexp, transformer));
    }

    private void record(String expression, StepKind kind, Object handler) {
        String thisClass = RecordingRegistrar.class.getName();
        String nestedPrefix = thisClass + "$";
        StackWalker.StackFrame caller =
                StackWalker.getInstance()
                        .walk(
                                frames ->
                                        frames.filter(
                                                        f -> {
                                                            String cn = f.getClassName();
                                                            // Exact match (this class) or a nested class of
                                                            // it (e.g. Binder) — NOT mere string-prefix, which
                                                            // would wrongly also skip an unrelated class whose
                                                            // name happens to start with the same characters.
                                                            return !cn.equals(thisClass)
                                                                    && !cn.startsWith(nestedPrefix);
                                                        })
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
        public <A, B> void context(String expression, Context2<C, A, B> handler) {
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
        public <A, B> void action(String expression, Context2<C, A, B> handler) {
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

        @Override
        public <A, B, R> void sensor(String expression, Sensor2<C, A, B, R> handler) {
            record(expression, StepKind.SENSOR, handler);
        }
    }
}
