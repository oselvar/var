package com.oselvar.var.runner.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;
import java.util.regex.Pattern;

/**
 * A step-definition fixture that defines a custom parameter type "size" (distinct from
 * {@link GammaSteps}' "color" type). Used by {@code StepLoaderTest} to verify merging of
 * custom parameter types with different names.
 */
public final class DeltaSteps implements StepDefinitions {

    public record Ctx(String size) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.steps(() -> new Ctx(""));
        s.param("size", Pattern.compile("small|large"));
        s.stimulus("delta sets size to {size}", (Ctx ctx, String size) -> new Ctx(size));
    }
}
