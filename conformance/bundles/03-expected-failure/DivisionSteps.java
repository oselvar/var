package dev.varar.conformance.bundle03;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/** Java sibling of {@code division.steps.ts} / {@code division.steps.py} (bundle {@code 03-expected-failure}). */
public final class DivisionSteps implements StepDefinitions<DivisionSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.stimulus(
                "I divide {int} by {int}",
                (Ctx ctx, Integer a, Integer b) -> {
                    if (b == 0) throw new ArithmeticException("division by zero");
                    return ctx;
                });
    }
}
