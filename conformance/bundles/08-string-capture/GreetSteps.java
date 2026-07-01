package com.oselvar.var.conformance.bundle08;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/** Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code 08-string-capture}). */
public final class GreetSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.action("I greet {string}", (Ctx ctx, String name) -> ctx);
    }
}
