package dev.varar;

import dev.varar.core.Registry;
import dev.varar.core.StepKind;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * The one object an author uses to declare a step file's state factory ({@link
 * #defineState}), its custom parameter types ({@link #param}), and its {@code
 * stimulus}/{@code sensor} steps. The runner constructs one per run per {@link
 * StepDefinitions} class and hands it to {@link StepDefinitions#register}:
 *
 * <pre>{@code
 * public final class CounterSteps implements StepDefinitions<Ctx> {
 *     @Override
 *     public void register(Steps<Ctx> s) {
 *         s.state(Ctx::new);
 *         s.stimulus("I increment", (Ctx ctx) -> new Ctx(ctx.count() + 1));
 *         s.sensor("The count is {int}", (Ctx ctx, Integer n) -> ctx.count());
 *     }
 * }
 * }</pre>
 *
 * <p>There is no global mutable accumulator and no reliance on static-initializer side
 * effects. This diverges deliberately from the TS/Python module-scope builder ({@code
 * internal.ts}'s {@code let steps = []}): those accumulators are not purely run-scoped
 * either — they usually get away with it because Node/Python execute a test file as a
 * fresh process — which is why both ship a reset hatch "for use in tests between isolated
 * scenarios". Java's classloader lifetime is not a run's lifetime, and {@code var-junit}
 * runs in-process, where {@code LauncherSession} reuse, {@code @RepeatedTest} and "rerun
 * failed tests" all drive more than one registration cycle through one classloader. A
 * fresh {@code Steps} per run avoids needing a reset hatch at all. Independently,
 * CLAUDE.md's "functional core, imperative shell" rule settles it: mutable accumulation
 * belongs in a shell-owned adapter, never a global inside the pure facade.
 *
 * <p>Handlers are declared as a <em>typed arity ladder</em> (Cucumber-JVM's approach):
 * one functional interface per capture count, so a lambda's parameters type-check against
 * the intended captures — {@code (Ctx ctx, Integer n) -> …} without any cast. Because the
 * overloads are disambiguated by lambda arity rather than parameter type, write the
 * parameter types explicitly: {@code (Ctx ctx, Integer n) -> …}, not {@code (ctx, n) -> …}.
 *
 * <p>Source location is captured via {@link StackWalker}, walking past this class's own
 * frames and any {@link StepsGlue}-annotated facade (e.g. var-kotlin's {@code StepsScope})
 * to find the author's actual call site.
 *
 * @param <C> this step file's context-state type
 */
public final class Steps<C extends State> {

    private Registry registry = Registry.createRegistry();
    private Supplier<? extends State> stateFactory = () -> State.Empty.INSTANCE;

    /** stimulus handler with no captures: observe {@code state}, return new state. */
    @FunctionalInterface
    public interface Stimulus0<C extends State> {
        C apply(C state);
    }

    /** stimulus handler with one capture {@code a}: return new state. */
    @FunctionalInterface
    public interface Stimulus1<C extends State, A> {
        C apply(C state, A a);
    }

    /** stimulus handler with two captures {@code a}, {@code b}: return new state. */
    @FunctionalInterface
    public interface Stimulus2<C extends State, A, B> {
        C apply(C state, A a, B b);
    }

    /** sensor with no captures: observe {@code state}, return a value the core compares. */
    @FunctionalInterface
    public interface Sensor0<C extends State, R> {
        R apply(C state);
    }

    /** sensor with one capture {@code a}: return a value the core compares. */
    @FunctionalInterface
    public interface Sensor1<C extends State, A, R> {
        R apply(C state, A a);
    }

    /** sensor with two captures {@code a}, {@code b}: return a value the core compares. */
    @FunctionalInterface
    public interface Sensor2<C extends State, A, B, R> {
        R apply(C state, A a, B b);
    }

    /**
     * A parameter type's {@code parse}: maps the matched capture groups to the argument
     * value a handler receives. Varargs (each capture group a separate argument), so
     * cucumber-expressions passes {@code groups[0]}, {@code groups[1]}, … directly.
     */
    @FunctionalInterface
    public interface Parse<T> {
        T apply(String... captures);
    }

    /**
     * Declares this step file's initial-state factory — a fresh state per example. A step
     * file whose steps are pure need not call this; handlers are then bound to {@link
     * State.Empty}.
     */
    public Steps<C> state(Supplier<C> factory) {
        this.stateFactory = factory;
        return this;
    }

    /**
     * Declare a custom cucumber-expression parameter type with an identity parse — the
     * argument a handler receives for {@code {name}} is the matched text.
     *
     * <p>A parameter type must be declared BEFORE any step whose expression uses
     * {@code {name}}, because each expression is compiled eagerly.
     */
    public Steps<C> param(String name, Pattern regexp) {
        registry = Registry.defineParameterType(registry, name, regexp, groups -> groups[0]);
        return this;
    }

    /**
     * Declare a custom parameter type whose {@code parse} maps the matched capture
     * group(s) to the argument value a handler receives.
     */
    public <T> Steps<C> param(String name, Pattern regexp, Parse<T> parse) {
        registry = Registry.defineParameterType(registry, name, regexp, groups -> parse.apply(groups));
        return this;
    }

    /**
     * As {@link #param(String, Pattern, Parse)}, additionally declaring {@code format} —
     * the inverse of {@code parse}, rendering a value of this type back in the document's
     * notation. Display-only: it never affects matching or the comparison verdict.
     */
    public <T> Steps<C> param(String name, Pattern regexp, Parse<T> parse, Function<T, String> format) {
        registry = Registry.defineParameterType(registry, name, regexp, groups -> parse.apply(groups), format);
        return this;
    }

    public Steps<C> stimulus(String expression, Stimulus0<C> handler) {
        return add(expression, StepKind.STIMULUS, handler);
    }

    public <A> Steps<C> stimulus(String expression, Stimulus1<C, A> handler) {
        return add(expression, StepKind.STIMULUS, handler);
    }

    public <A, B> Steps<C> stimulus(String expression, Stimulus2<C, A, B> handler) {
        return add(expression, StepKind.STIMULUS, handler);
    }

    public <R> Steps<C> sensor(String expression, Sensor0<C, R> handler) {
        return add(expression, StepKind.SENSOR, handler);
    }

    public <A, R> Steps<C> sensor(String expression, Sensor1<C, A, R> handler) {
        return add(expression, StepKind.SENSOR, handler);
    }

    public <A, B, R> Steps<C> sensor(String expression, Sensor2<C, A, B, R> handler) {
        return add(expression, StepKind.SENSOR, handler);
    }

    // ─── runner plumbing: not part of the authoring surface ───────────────────

    /** The registry built so far. Package-private: tests in this package only. */
    Registry registry() {
        return registry;
    }

    /** The registered state factory. Package-private: tests in this package only. */
    Supplier<? extends State> stateFactory() {
        return stateFactory;
    }

    /**
     * Instantiates nothing and mutates nothing global: registers {@code definitions} into
     * a fresh {@code Steps} and returns what the runner needs. The wildcard capture lives
     * here so callers can hold a {@code StepDefinitions<?>} without naming its state type.
     *
     * <p>Runner/adapter plumbing — authors never call this.
     */
    public static Bound bind(StepDefinitions<?> definitions) {
        return bindCaptured(definitions);
    }

    private static <C extends State> Bound bindCaptured(StepDefinitions<C> definitions) {
        Steps<C> steps = new Steps<>();
        definitions.register(steps);
        return new Bound(steps.registry, steps.stateFactory);
    }

    /**
     * What a registered step-definition class yields: the immutable core registry plus
     * this file's state factory (a facade-only concern — the core registry knows about
     * step expressions and handlers, not per-file state factories).
     *
     * <p>Runner/adapter plumbing — authors never construct this.
     */
    public record Bound(Registry registry, Supplier<? extends State> stateFactory) {}

    private Steps<C> add(String expression, StepKind kind, Object handler) {
        String thisClass = Steps.class.getName();
        String nestedPrefix = thisClass + "$";
        StackWalker.StackFrame caller = StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE)
                .walk(frames -> frames.filter(f -> {
                            Class<?> declaring = f.getDeclaringClass();
                            String cn = declaring.getName();
                            // Exact match (this class) or a nested class of it — NOT mere
                            // string-prefix, which would wrongly also skip an unrelated
                            // class whose name happens to start the same (e.g. "StepsTest").
                            return !cn.equals(thisClass) && !cn.startsWith(nestedPrefix) && !isGlue(declaring);
                        })
                        .findFirst()
                        .orElseThrow());
        registry = Registry.addStep(registry, expression, caller.getFileName(), caller.getLineNumber(), handler, kind);
        return this;
    }

    /**
     * A frame belongs to registration glue if its declaring class — or any class
     * enclosing it (covers lambdas/anonymous classes synthesized inside a glue class) —
     * is annotated {@link StepsGlue}.
     */
    private static boolean isGlue(Class<?> declaring) {
        for (Class<?> c = declaring; c != null; c = c.getEnclosingClass()) {
            if (c.isAnnotationPresent(StepsGlue.class)) {
                return true;
            }
        }
        return false;
    }
}
