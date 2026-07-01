package com.oselvar.var.conformance.bundle03;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/** Java sibling of {@code division.steps.ts} / {@code division.steps.py} (bundle {@code 03-expected-failure}). */
public final class DivisionSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.action(
                "I divide {int} by {int}",
                (Ctx ctx, Integer a, Integer b) -> {
                    if (b == 0) throw new ArithmeticException("division by zero");
                    return ctx;
                });
    }
}
