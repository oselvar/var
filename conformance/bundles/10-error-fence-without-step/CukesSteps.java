package com.oselvar.var.conformance.bundle10;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Java sibling of {@code cukes.steps.ts} / {@code cukes.steps.py} (bundle {@code
 * 10-error-fence-without-step}). The example's prose matches no step, so the {@code
 * error} fence (which marks the example expected-to-fail) has nothing to run ->
 * error-fence-without-step diagnostic, and the example is dropped (a plan-stage
 * concern; this stage only needs the one step registered).
 */
public final class CukesSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.action("I have {int} cukes", (Ctx ctx, Integer n) -> ctx);
    }
}
