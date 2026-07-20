package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.regex.Pattern;

/**
 * A step-definition fixture that defines a custom parameter type "color" with the same
 * name as {@link GammaSteps}. Used by {@code StepLoaderTest} to verify that duplicate
 * custom parameter-type names are rejected during merge.
 */
public final class EpsilonSteps implements StepDefinitions<EpsilonSteps.Ctx> {

    public record Ctx(String color) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(""));
        s.param("color", Pattern.compile("[a-z]+"));
        s.stimulus("epsilon sets color to {color}", (Ctx ctx, String color) -> new Ctx(color));
    }
}
