package com.oselvar.var.conformance.bundle02;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/** Java sibling of {@code counter.steps.ts} / {@code counter.steps.py} (bundle {@code 02-context-isolation}). */
public final class CounterSteps implements StepDefinitions {

    record Ctx(int count) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(0));

        s.action("I increment", (Ctx ctx) -> new Ctx(ctx.count() + 1));

        s.sensor("The count is {int}", (Ctx ctx, Integer n) -> ctx.count());
    }
}
