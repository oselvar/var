package com.oselvar.var.runner.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;
import java.util.regex.Pattern;

/**
 * A step-definition fixture that defines a custom parameter type "color". Used by {@code
 * StepLoaderTest} to verify merging of custom parameter types across multiple classes.
 */
public final class GammaSteps implements StepDefinitions {

    public record Ctx(String color) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        registrar.defineParameterType("color", Pattern.compile("red|green|blue"), groups -> groups[0]);
        var s = registrar.defineState(() -> new Ctx(""));
        s.action("gamma sets color to {color}", (Ctx ctx, String color) -> new Ctx(color));
    }
}
