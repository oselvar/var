package com.oselvar.var;

import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * The one object an author uses to declare custom parameter types ({@link #param}) and
 * register {@code stimulus}/{@code sensor} steps — the Java analogue of the {@code
 * (param, stimulus, sensor)} trio TS/Python destructure out of {@code steps}. Obtained
 * from {@link Registrar#steps}.
 *
 * <p>Handlers are declared as a <em>typed arity ladder</em> (Cucumber-JVM's approach):
 * one functional interface per capture count, so a lambda's parameters type-check against
 * the intended captures — {@code (Ctx ctx, Integer n) -> …} without any cast. The ladder
 * here covers arities 0 and 1 (enough for the roman-numerals bundle); Task 12/18 extend
 * it to the arities the conformance corpus needs plus the trailing data-table/doc-string
 * argument the runtime appends. The canonical form the executor (Task 18) invokes after
 * resolving captures from the Cucumber expression is {@code (State, Object[])}; these
 * typed SAMs are author-facing sugar over that.
 *
 * <p>Because the {@code Stimulus0}/{@code Stimulus1} (and {@code Sensor0}/{@code Sensor1})
 * overloads are disambiguated by lambda arity, not by parameter type, a capturing
 * handler's parameter type cannot be inferred from a bare {@code (ctx, n) -> …} — write
 * it as {@code (Ctx ctx, Integer n) -> …} with explicit types.
 *
 * @param <C> this step file's context-state type
 */
public interface StateBinder<C extends State> {

    /** stimulus handler with no captures: observe {@code state}, return new state. */
    @FunctionalInterface
    interface Stimulus0<C extends State> {
        C apply(C state);
    }

    /** stimulus handler with one capture {@code a}: return new state. */
    @FunctionalInterface
    interface Stimulus1<C extends State, A> {
        C apply(C state, A a);
    }

    /** stimulus handler with two captures {@code a}, {@code b}: return new state. */
    @FunctionalInterface
    interface Stimulus2<C extends State, A, B> {
        C apply(C state, A a, B b);
    }

    /** sensor with no captures: observe {@code state}, return a value the core compares. */
    @FunctionalInterface
    interface Sensor0<C extends State, R> {
        R apply(C state);
    }

    /** sensor with one capture {@code a}: return a value the core compares. */
    @FunctionalInterface
    interface Sensor1<C extends State, A, R> {
        R apply(C state, A a);
    }

    /** sensor with two captures {@code a}, {@code b}: return a value the core compares. */
    @FunctionalInterface
    interface Sensor2<C extends State, A, B, R> {
        R apply(C state, A a, B b);
    }

    /**
     * A parameter type's {@code parse}: maps the matched capture groups to the argument
     * value a handler receives. Varargs (each capture group a separate argument), so
     * cucumber-expressions passes {@code groups[0]}, {@code groups[1]}, … directly.
     */
    @FunctionalInterface
    interface Parse<T> {
        T apply(String... captures);
    }

    /**
     * Declare a custom cucumber-expression parameter type with an identity parse — the
     * argument a handler receives for {@code {name}} is the matched text.
     *
     * <p>A parameter type must be declared BEFORE any step whose expression uses
     * {@code {name}}, because each expression is compiled eagerly.
     *
     * @param name the {@code {name}} placeholder this type matches
     * @param regexp the pattern a placeholder occurrence must match
     */
    void param(String name, Pattern regexp);

    /**
     * Declare a custom parameter type whose {@code parse} maps the matched capture
     * group(s) to the argument value a handler receives.
     *
     * @param <T> the type {@code parse} produces
     */
    <T> void param(String name, Pattern regexp, Parse<T> parse);

    /**
     * As {@link #param(String, Pattern, Parse)}, additionally declaring {@code format} —
     * the inverse of {@code parse}, rendering a value of this type back in the document's
     * notation. Display-only: when a sensor's returned value mismatches a transformed
     * inline parameter, the failure's expected/actual strings render through
     * {@code format}; it never affects matching or the comparison verdict.
     *
     * @param <T> the type {@code parse} produces and {@code format} renders
     */
    <T> void param(String name, Pattern regexp, Parse<T> parse, Function<T, String> format);

    void stimulus(String expression, Stimulus0<C> handler);

    <A> void stimulus(String expression, Stimulus1<C, A> handler);

    <A, B> void stimulus(String expression, Stimulus2<C, A, B> handler);

    <R> void sensor(String expression, Sensor0<C, R> handler);

    <A, R> void sensor(String expression, Sensor1<C, A, R> handler);

    <A, B, R> void sensor(String expression, Sensor2<C, A, B, R> handler);
}
