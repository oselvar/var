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
        var s = registrar.steps(() -> new Ctx(""));
        s.param("color", Pattern.compile("red|green|blue"));
        s.stimulus("gamma sets color to {color}", (Ctx ctx, String color) -> new Ctx(color));
    }
}
