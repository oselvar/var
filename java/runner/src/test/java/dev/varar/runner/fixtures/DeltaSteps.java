package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.regex.Pattern;

/**
 * A step-definition fixture that defines a custom parameter type "size" (distinct from
 * {@link GammaSteps}' "color" type). Used by {@code StepLoaderTest} to verify merging of
 * custom parameter types with different names.
 */
public final class DeltaSteps implements StepDefinitions<DeltaSteps.Ctx> {

    public record Ctx(String size) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(""));
        s.param("size", Pattern.compile("small|large"));
        s.stimulus("delta sets size to {size}", (Ctx ctx, String size) -> new Ctx(size));
    }
}
