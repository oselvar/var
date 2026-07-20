package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.regex.Pattern;

/**
 * A step-definition fixture that defines a custom parameter type "color". Used by {@code
 * StepLoaderTest} to verify merging of custom parameter types across multiple classes.
 */
public final class GammaSteps implements StepDefinitions<GammaSteps.Ctx> {

    public record Ctx(String color) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(""));
        s.param("color", Pattern.compile("red|green|blue"));
        s.stimulus("gamma sets color to {color}", (Ctx ctx, String color) -> new Ctx(color));
    }
}
