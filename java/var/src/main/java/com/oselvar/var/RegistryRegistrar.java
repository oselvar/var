package com.oselvar.var;

import com.oselvar.var.core.Registry;
import com.oselvar.var.core.StepKind;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * The production {@link Registrar}: every {@code stimulus}/{@code sensor}
 * registration is delegated to {@link Registry#addStep}, and every {@link
 * StateBinder#param} call to {@link Registry#defineParameterType} — building a real
 * var-core {@link Registry}, not just recording calls the way {@code RecordingRegistrar}
 * (a test-only double, see {@code AuthorApiTest}) does.
 *
 * <p>Source location is captured via {@link StackWalker} (the modern replacement for
 * parsing a stack-trace string — see the design doc's Author API section), walking past
 * this class's own frames (including its private {@link Binder}) to find the author's
 * actual call site.
 *
 * <p>One instance is constructed fresh per run per {@link StepDefinitions} class — see
 * {@link Registrar}'s Javadoc for why there is deliberately no static/global
 * accumulator. The resulting immutable {@link Registry} is retrieved via {@link
 * #registry()} once {@link StepDefinitions#defineSteps} returns. The single state
 * factory passed to {@link #steps} is retained via {@link #stateFactory()} — it is
 * not part of the core {@link Registry} (mirrors TS's {@code contextFactoriesByFile}: a
 * facade-only concern, since the core registry only knows about step
 * expressions/handlers, not per-file state factories).
 */
public final class RegistryRegistrar implements Registrar {

    private Registry registry = Registry.createRegistry();
    private Supplier<? extends State> stateFactory;

    /** The {@link Registry} built so far from every registration made on this instance. */
    public Registry registry() {
        return registry;
    }

    /**
     * The single state factory registered via {@link #steps}, or {@code null} if
     * {@link #steps} has not been called yet.
     */
    public Supplier<? extends State> stateFactory() {
        return stateFactory;
    }

    @Override
    public <C extends State> StateBinder<C> steps(Supplier<C> factory) {
        this.stateFactory = factory;
        return new Binder<>();
    }

    private void register(String expression, StepKind kind, Object handler) {
        String thisClass = RegistryRegistrar.class.getName();
        String nestedPrefix = thisClass + "$";
        StackWalker.StackFrame caller = StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE)
                .walk(frames -> frames.filter(f -> {
                            Class<?> declaring = f.getDeclaringClass();
                            String cn = declaring.getName();
                            // Exact match (this class) or a nested class of
                            // it (e.g. Binder) — NOT mere string-prefix, which
                            // would wrongly also skip an unrelated class whose
                            // name happens to start with the same characters
                            // (e.g. a caller named "RegistryRegistrarTest").
                            return !cn.equals(thisClass) && !cn.startsWith(nestedPrefix) && !isRegistrarGlue(declaring);
                        })
                        .findFirst()
                        .orElseThrow());
        registry = Registry.addStep(registry, expression, caller.getFileName(), caller.getLineNumber(), handler, kind);
    }

    /**
     * A frame belongs to registration glue if its declaring class — or any class
     * enclosing it (covers lambdas/anonymous classes synthesized inside a glue
     * class) — is annotated {@link RegistrarGlue}.
     */
    private static boolean isRegistrarGlue(Class<?> declaring) {
        for (Class<?> c = declaring; c != null; c = c.getEnclosingClass()) {
            if (c.isAnnotationPresent(RegistrarGlue.class)) {
                return true;
            }
        }
        return false;
    }

    private final class Binder<C extends State> implements StateBinder<C> {
        @Override
        public void param(String name, Pattern regexp) {
            registry = Registry.defineParameterType(registry, name, regexp, groups -> groups[0]);
        }

        @Override
        public <T> void param(String name, Pattern regexp, Parse<T> parse) {
            registry = Registry.defineParameterType(registry, name, regexp, groups -> parse.apply(groups));
        }

        @Override
        public <T> void param(String name, Pattern regexp, Parse<T> parse, Function<T, String> format) {
            registry = Registry.defineParameterType(registry, name, regexp, groups -> parse.apply(groups), format);
        }

        @Override
        public void stimulus(String expression, Stimulus0<C> handler) {
            register(expression, StepKind.STIMULUS, handler);
        }

        @Override
        public <A> void stimulus(String expression, Stimulus1<C, A> handler) {
            register(expression, StepKind.STIMULUS, handler);
        }

        @Override
        public <A, B> void stimulus(String expression, Stimulus2<C, A, B> handler) {
            register(expression, StepKind.STIMULUS, handler);
        }

        @Override
        public <R> void sensor(String expression, Sensor0<C, R> handler) {
            register(expression, StepKind.SENSOR, handler);
        }

        @Override
        public <A, R> void sensor(String expression, Sensor1<C, A, R> handler) {
            register(expression, StepKind.SENSOR, handler);
        }

        @Override
        public <A, B, R> void sensor(String expression, Sensor2<C, A, B, R> handler) {
            register(expression, StepKind.SENSOR, handler);
        }
    }
}
