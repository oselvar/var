package com.oselvar.var.conformance.bundle05;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Java sibling of {@code cukes.steps.ts} / {@code cukes.steps.py} (bundle {@code
 * 05-ambiguous-match}). Both expressions match "I have 5 cukes" -&gt; ambiguous-match
 * diagnostic (a later, plan-stage concern; this stage only needs both registered).
 */
public final class CukesSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.action("I have {int} cukes", (Ctx ctx, Integer n) -> ctx);
        s.action("I have 5 cukes", (Ctx ctx) -> ctx);
    }
}
