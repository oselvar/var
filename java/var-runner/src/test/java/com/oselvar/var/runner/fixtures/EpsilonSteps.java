package com.oselvar.var.runner.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;
import java.util.regex.Pattern;

/**
 * A step-definition fixture that defines a custom parameter type "color" with the same
 * name as {@link GammaSteps}. Used by {@code StepLoaderTest} to verify that duplicate
 * custom parameter-type names are rejected during merge.
 */
public final class EpsilonSteps implements StepDefinitions {

    public record Ctx(String color) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.steps(() -> new Ctx(""));
        s.param("color", Pattern.compile("[a-z]+"));
        s.stimulus("epsilon sets color to {color}", (Ctx ctx, String color) -> new Ctx(color));
    }
}
