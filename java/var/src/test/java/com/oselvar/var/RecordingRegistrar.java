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

    record Registration(String expression, StepKind kind, Object handler, String sourceFile, int sourceLine) {}

    record ParamTypeRegistration(
            String name, Pattern regexp, Function<String[], ?> parse, Function<?, String> format) {}

    private final List<Registration> steps = new ArrayList<>();
    private final List<Supplier<? extends State>> factories = new ArrayList<>();
    private final List<ParamTypeRegistration> paramTypes = new ArrayList<>();

    List<Registration> recordedSteps() {
        return List.copyOf(steps);
    }

    List<Supplier<? extends State>> factories() {
        return List.copyOf(factories);
    }

    List<ParamTypeRegistration> paramTypes() {
        return List.copyOf(paramTypes);
    }

    @Override
    public <C extends State> StateBinder<C> steps(Supplier<C> factory) {
        factories.add(factory);
        return new Binder<>();
    }

    private void record(String expression, StepKind kind, Object handler) {
        String thisClass = RecordingRegistrar.class.getName();
        String nestedPrefix = thisClass + "$";
        StackWalker.StackFrame caller = StackWalker.getInstance()
                .walk(frames -> frames.filter(f -> {
                            String cn = f.getClassName();
                            // Exact match (this class) or a nested class of
                            // it (e.g. Binder) — NOT mere string-prefix, which
                            // would wrongly also skip an unrelated class whose
                            // name happens to start with the same characters.
                            return !cn.equals(thisClass) && !cn.startsWith(nestedPrefix);
                        })
                        .findFirst()
                        .orElseThrow());
        steps.add(new Registration(expression, kind, handler, caller.getFileName(), caller.getLineNumber()));
    }

    private final class Binder<C extends State> implements StateBinder<C> {
        @Override
        public void param(String name, Pattern regexp) {
            paramTypes.add(new ParamTypeRegistration(name, regexp, groups -> groups[0], null));
        }

        @Override
        public <T> void param(String name, Pattern regexp, Parse<T> parse) {
            paramTypes.add(new ParamTypeRegistration(name, regexp, parse::apply, null));
        }

        @Override
        public <T> void param(String name, Pattern regexp, Parse<T> parse, Function<T, String> format) {
            paramTypes.add(new ParamTypeRegistration(name, regexp, parse::apply, format));
        }

        @Override
        public void stimulus(String expression, Stimulus0<C> handler) {
            record(expression, StepKind.STIMULUS, handler);
        }

        @Override
        public <A> void stimulus(String expression, Stimulus1<C, A> handler) {
            record(expression, StepKind.STIMULUS, handler);
        }

        @Override
        public <A, B> void stimulus(String expression, Stimulus2<C, A, B> handler) {
            record(expression, StepKind.STIMULUS, handler);
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
