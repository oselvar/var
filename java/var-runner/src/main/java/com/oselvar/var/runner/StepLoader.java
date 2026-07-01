package com.oselvar.var.runner;

import com.oselvar.var.RegistryRegistrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;
import com.oselvar.var.core.Registry;
import io.cucumber.cucumberexpressions.ParameterTypeRegistry;
import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Reflectively loads a run's {@link StepDefinitions} classes, merges each one's own
 * {@link Registry} into a single shared one, and builds the per-file {@code
 * createContext} function {@link com.oselvar.var.core.Execute} expects.
 *
 * <h2>One {@code RegistryRegistrar} per {@code StepDefinitions} class</h2>
 *
 * <p>Mirrors {@code Registrar}'s own contract (see its javadoc): "one state factory per
 * step-definition class." Sharing a single {@code RegistryRegistrar} across multiple
 * {@code StepDefinitions} instances would let a second class's {@code defineState} call
 * silently overwrite the first's {@code stateFactory} — this class avoids that by
 * constructing a fresh {@code RegistryRegistrar} per instantiated class (see the loop in
 * {@link #loadSteps}), exactly as {@code Execute.runExample}'s per-example, per-file
 * state cache assumes.
 *
 * <h2>The context-lookup key</h2>
 *
 * <p>Confirmed by reading {@code Execute.runExample} directly: it does {@code
 * state = resolve(createContext.apply(file))} where {@code file =
 * step.stepDef().expressionSourceFile()} — a plain {@code String}, the exact source
 * file name {@code RegistryRegistrar}'s {@code StackWalker} captured for every step a
 * given class registers (all steps from one class share the same caller file, since
 * {@code StackWalker} always finds the same calling file for a given class's
 * registrations). So the key {@link #loadSteps} must produce for {@code createContext}
 * is that same string — not the {@code Class} object, not a synthetic id.
 *
 * <p>Because every step a class registers reports the SAME {@code
 * expressionSourceFile}, this class only needs to read ONE of them (the first) to learn
 * the key for that whole class's {@code stateFactory}. A class whose {@code
 * defineSteps} calls {@code defineState} but registers zero {@code
 * context}/{@code action}/{@code sensor} steps has a {@code stateFactory} but no
 * {@code expressionSourceFile} to key it by — {@link #loadSteps} skips contributing a
 * context-map entry for it. This is safe, not a loss: {@code Execute} only ever calls
 * {@code createContext.apply} with a step's OWN {@code expressionSourceFile}, and a
 * class with no steps has no step that could ever supply that file as a lookup key in
 * the first place.
 *
 * <h2>Merging registries</h2>
 *
 * <p>{@link Registry} has no built-in cross-registry merge — {@link #loadSteps}
 * provides one, since {@code var-core}'s {@code Registry} is frozen behavior from the
 * core-port plan (this is a legitimate small addition to {@code var-runner}, not a
 * change to {@code var-core}).
 *
 * <p><b>Why this does not go through {@link Registry#addStep}/{@code
 * Registry.defineParameterType}, despite the design note suggesting it:</b> {@code
 * addStep} recompiles a raw expression string against the ACCUMULATOR's own {@code
 * ParameterTypeRegistry}, which would only produce a correct result for a step using a
 * custom parameter type if that type were re-registered on the accumulator first. But
 * {@code ParameterTypeRegistry.getParameterTypes()} — confirmed via {@code javap} — is
 * package-private in {@code io.cucumber.cucumberexpressions}, so there is no accessible
 * way from {@code com.oselvar.var.runner} to enumerate a source registry's custom
 * parameter types in order to re-register them. Recompiling is unnecessary anyway: each
 * {@link Registry.StepRegistration#compiled} is already a fully-compiled {@code
 * Expression}, self-contained and independent of any registry object once built (it was
 * built once, correctly, against its OWN registry's parameter types back in {@code
 * RegistryRegistrar}). So merging is simply concatenating each source registry's {@code
 * steps()} list into the accumulator's — reusing the already-compiled expressions as-is
 * — with the same duplicate-expression check {@code addStep} performs (and the same
 * error message shape), since two classes accidentally registering the identical
 * expression is a genuine authoring bug this merge should still catch.
 */
public final class StepLoader {

    private StepLoader() {}

    /** One run's merged step registry plus its per-file initial-state lookup. */
    public record LoadedSteps(Registry registry, Function<String, Object> createContext) {}

    /**
     * Loads every named {@link StepDefinitions} class from {@code loader}, merges their
     * registries into one, and returns the merged {@link LoadedSteps}.
     *
     * @param stepClassNames fully-qualified class names, each implementing {@link
     *     StepDefinitions} with a public no-arg constructor
     * @param loader the classloader to resolve {@code stepClassNames} against
     * @throws IllegalArgumentException if a name can't be resolved to a class, the
     *     resolved class doesn't implement {@link StepDefinitions}, or two classes
     *     register the identical step expression
     * @throws IllegalStateException if a resolved class can't be instantiated via a
     *     public no-arg constructor
     */
    public static LoadedSteps loadSteps(List<String> stepClassNames, ClassLoader loader) {
        List<Registry.StepRegistration> mergedSteps = new ArrayList<>();
        ParameterTypeRegistry parameterTypes = null;
        Map<String, Supplier<? extends State>> factoriesByFile = new HashMap<>();

        for (String className : stepClassNames) {
            StepDefinitions instance = instantiate(className, loader);
            RegistryRegistrar registrar = new RegistryRegistrar();
            instance.defineSteps(registrar);

            Registry own = registrar.registry();
            if (parameterTypes == null) {
                // Arbitrary pick: the FIRST class's ParameterTypeRegistry becomes the
                // merged registry's own — it's never consulted again once every step's
                // Expression is already compiled (see class javadoc), so which one is
                // kept is immaterial to matching.
                parameterTypes = own.parameterTypes();
            }
            for (Registry.StepRegistration step : own.steps()) {
                requireNoDuplicate(mergedSteps, step);
                mergedSteps.add(step);
            }

            if (!own.steps().isEmpty()) {
                // Every step from this one RegistryRegistrar shares the same
                // expressionSourceFile (StackWalker finds the same caller file every
                // time register() runs from this class) — any one of them is the key.
                String file = own.steps().get(0).expressionSourceFile();
                factoriesByFile.put(file, registrar.stateFactory());
            }
            // else: defineState was called but zero steps were registered (a
            // context-only class) — there's no expressionSourceFile to key it by, and
            // none is ever needed, since Execute only looks up a file that has at least
            // one step registered against it.
        }

        Registry merged =
                new Registry(
                        mergedSteps,
                        parameterTypes != null ? parameterTypes : Registry.createRegistry().parameterTypes());
        Map<String, Supplier<? extends State>> resolvedFactories = Map.copyOf(factoriesByFile);
        Function<String, Object> createContext =
                file -> {
                    Supplier<? extends State> factory = resolvedFactories.get(file);
                    if (factory == null) {
                        throw new IllegalStateException(
                                "no state factory registered for step-definition file \""
                                        + file
                                        + "\" (loaded classes: "
                                        + stepClassNames
                                        + ")");
                    }
                    return factory.get();
                };
        return new LoadedSteps(merged, createContext);
    }

    private static void requireNoDuplicate(
            List<Registry.StepRegistration> mergedSteps, Registry.StepRegistration incoming) {
        for (Registry.StepRegistration existing : mergedSteps) {
            if (existing.expression().equals(incoming.expression())) {
                throw new IllegalArgumentException(
                        "duplicate step definition for \""
                                + incoming.expression()
                                + "\" at "
                                + existing.expressionSourceFile()
                                + ":"
                                + existing.expressionSourceLine()
                                + " and "
                                + incoming.expressionSourceFile()
                                + ":"
                                + incoming.expressionSourceLine());
            }
        }
    }

    private static StepDefinitions instantiate(String className, ClassLoader loader) {
        Class<?> rawClass;
        try {
            rawClass = Class.forName(className, true, loader);
        } catch (ClassNotFoundException e) {
            throw new IllegalArgumentException("step-definition class not found: " + className, e);
        }
        if (!StepDefinitions.class.isAssignableFrom(rawClass)) {
            throw new IllegalArgumentException(
                    className + " does not implement " + StepDefinitions.class.getName());
        }
        try {
            return (StepDefinitions) rawClass.getDeclaredConstructor().newInstance();
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(className + " has no public no-arg constructor", e);
        } catch (InstantiationException | IllegalAccessException | InvocationTargetException e) {
            throw new IllegalStateException("cannot instantiate " + className, e);
        }
    }
}
