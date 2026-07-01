package com.oselvar.var.core;

import io.cucumber.cucumberexpressions.CaptureGroupTransformer;
import io.cucumber.cucumberexpressions.Expression;
import io.cucumber.cucumberexpressions.ExpressionFactory;
import io.cucumber.cucumberexpressions.ParameterType;
import io.cucumber.cucumberexpressions.ParameterTypeRegistry;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Step registry — port of {@code var-core/src/registry.ts}. Wraps the Java {@code
 * cucumber-expressions} library ({@code io.cucumber:cucumber-expressions:20.0.0}).
 *
 * <p><b>API-surface note, confirmed against the 20.0.0 jar (via {@code javap -p}), not
 * assumed:</b> the TS/Python ports construct {@code CucumberExpression} from a public
 * constructor. The Java library's {@code CucumberExpression(String,
 * ParameterTypeRegistry)} constructor is package-private — {@code javap} prints it with
 * no access modifier, and the class is otherwise unreachable for direct construction
 * from {@code com.oselvar.var.core}. The library's public entry point is instead {@code
 * ExpressionFactory(ParameterTypeRegistry).createExpression(String)}, which returns the
 * public {@code Expression} interface (dispatching internally to a {@code
 * CucumberExpression} unless the source string is itself an anchored/regex-literal form
 * — {@code ^...$} or {@code /.../} — which this project's step expressions never are;
 * confirmed by reading {@code ExpressionFactory}'s decompiled bytecode). {@link
 * StepRegistration#compiled} is therefore typed as {@code Expression}, not the
 * (inaccessible) concrete {@code CucumberExpression} — {@code Expression}'s {@code
 * match}/{@code getRegexp}/{@code getSource} are exactly what Task 14's matcher needs
 * regardless of the concrete implementation.
 *
 * <p>{@code ParameterTypeRegistry} likewise has no no-arg constructor in this version —
 * only {@code ParameterTypeRegistry(Locale)}. {@link Locale#ENGLISH} is used here; this
 * only affects locale-sensitive built-in types ({@code float}/{@code double} decimal
 * separators), not {@code int}/{@code word}/{@code string}.
 */
public record Registry(List<StepRegistration> steps, ParameterTypeRegistry parameterTypes) {

    public Registry {
        steps = List.copyOf(steps);
    }

    /**
     * One registered step: its source cucumber expression, source location, handler
     * (retained type-erased as {@link Object} — execution is a later task), the compiled
     * expression, and its role. {@code kind} may be {@code null} (the legacy/kindless
     * step path, mirroring TS/Python's optional {@code kind}).
     */
    public record StepRegistration(
            String expression,
            String expressionSourceFile,
            int expressionSourceLine,
            Object handler,
            Expression compiled,
            StepKind kind) {}

    /** An empty registry with a fresh default {@link ParameterTypeRegistry}. */
    public static Registry createRegistry() {
        return new Registry(List.of(), new ParameterTypeRegistry(Locale.ENGLISH));
    }

    /**
     * Compiles {@code expression} against {@code registry}'s parameter types and appends
     * it, returning a new {@link Registry}; the original is unchanged.
     *
     * @throws IllegalArgumentException if {@code expression} duplicates an existing
     *     registration in {@code registry} — the message lists both source positions,
     *     mirroring {@code registry.ts}'s error text.
     */
    public static Registry addStep(
            Registry registry,
            String expression,
            String expressionSourceFile,
            int expressionSourceLine,
            Object handler,
            StepKind kind) {
        for (StepRegistration existing : registry.steps()) {
            if (existing.expression().equals(expression)) {
                throw new IllegalArgumentException(
                        "duplicate step definition for \""
                                + expression
                                + "\" at "
                                + existing.expressionSourceFile()
                                + ":"
                                + existing.expressionSourceLine()
                                + " and "
                                + expressionSourceFile
                                + ":"
                                + expressionSourceLine);
            }
        }
        Expression compiled =
                new ExpressionFactory(registry.parameterTypes()).createExpression(expression);
        List<StepRegistration> next = new ArrayList<>(registry.steps());
        next.add(
                new StepRegistration(
                        expression, expressionSourceFile, expressionSourceLine, handler, compiled, kind));
        return new Registry(next, registry.parameterTypes());
    }

    /**
     * Registers a custom parameter type on {@code registry}'s shared {@link
     * ParameterTypeRegistry}. The registry object returned is the same instance passed
     * in — {@code ParameterTypeRegistry.defineParameterType} mutates in place, and (as in
     * the TS/Python ports) that mutation is intentionally shared across every step
     * subsequently compiled against this registry.
     *
     * @param transformer maps the matched capture group(s) to the argument value; unlike
     *     TS/Python there is no implicit identity default — callers pass one explicitly
     */
    public static <T> Registry defineParameterType(
            Registry registry, String name, Pattern regexp, Function<String[], T> transformer) {
        CaptureGroupTransformer<T> adapted = groups -> transformer.apply(groups);
        // TS passes `null` for `type` (a JS ParameterType tolerates it, deanonymizing
        // later); this library's constructor `Objects.requireNonNull`s it (confirmed via
        // decompiled bytecode) — `Object.class` is the same stand-in the library's own
        // `createAnonymousParameterType` passes when no concrete type is known.
        ParameterType<T> parameterType =
                new ParameterType<>(
                        name,
                        List.of(regexp.pattern()),
                        (Type) Object.class,
                        adapted,
                        /* useForSnippets= */ true,
                        /* preferForRegexpMatch= */ false,
                        /* useRegexpMatchAsStrongTypeHint= */ false);
        registry.parameterTypes().defineParameterType(parameterType);
        return registry;
    }
}
