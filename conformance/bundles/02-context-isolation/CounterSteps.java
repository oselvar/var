package dev.varar.conformance.bundle02;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/** Java sibling of {@code counter.steps.ts} / {@code counter.steps.py} (bundle {@code 02-context-isolation}). */
public final class CounterSteps implements StepDefinitions<CounterSteps.Ctx> {

    record Ctx(int count) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0));

        s.stimulus("I increment", (Ctx ctx) -> new Ctx(ctx.count() + 1));

        s.sensor("The count is {int}", (Ctx ctx, Integer n) -> ctx.count());
    }
}
