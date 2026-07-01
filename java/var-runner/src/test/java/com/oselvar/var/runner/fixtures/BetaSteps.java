package com.oselvar.var.runner.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;

/**
 * See {@link AlphaSteps}' javadoc — this fixture's role is to be a genuinely separate
 * step-definition file (own top-level class, own {@code .java} file) with its own
 * {@link State} type and its own {@code defineState} call, so {@code StepLoaderTest}
 * can prove {@link com.oselvar.var.runner.StepLoader} doesn't cross-wire this file's
 * state factory with {@link AlphaSteps}'.
 */
public final class BetaSteps implements StepDefinitions {

    public record Ctx(String label) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.defineState(() -> new Ctx(""));
        s.action("beta sets label to {word}", (Ctx ctx, String label) -> new Ctx(label));
        s.sensor("beta label is {word}", (Ctx ctx, String expected) -> ctx.label());
    }
}
