package com.oselvar.var;

/**
 * The three role-registration methods bound to one state factory — the Java analogue of
 * the {@code (context, action, sensor)} triple TS/Python destructure out of {@code
 * defineState}/{@code define_state}. Obtained from {@link Registrar#defineState}.
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
 * <p>Because the {@code Context0}/{@code Context1} (and {@code Sensor0}/{@code Sensor1})
 * overloads are disambiguated by lambda arity, not by parameter type, a capturing
 * handler's parameter type cannot be inferred from a bare {@code (ctx, n) -> …} — write
 * it as {@code (Ctx ctx, Integer n) -> …} with explicit types.
 *
 * @param <C> this step file's context-state type
 */
public interface StateBinder<C extends State> {

    /** context/action handler with no captures: observe {@code state}, return new state. */
    @FunctionalInterface
    interface Context0<C extends State> {
        C apply(C state);
    }

    /** context/action handler with one capture {@code a}: return new state. */
    @FunctionalInterface
    interface Context1<C extends State, A> {
        C apply(C state, A a);
    }

    /** context/action handler with two captures {@code a}, {@code b}: return new state. */
    @FunctionalInterface
    interface Context2<C extends State, A, B> {
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

    void context(String expression, Context0<C> handler);

    <A> void context(String expression, Context1<C, A> handler);

    <A, B> void context(String expression, Context2<C, A, B> handler);

    void action(String expression, Context0<C> handler);

    <A> void action(String expression, Context1<C, A> handler);

    <A, B> void action(String expression, Context2<C, A, B> handler);

    <R> void sensor(String expression, Sensor0<C, R> handler);

    <A, R> void sensor(String expression, Sensor1<C, A, R> handler);

    <A, B, R> void sensor(String expression, Sensor2<C, A, B, R> handler);
}
