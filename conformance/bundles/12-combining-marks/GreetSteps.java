package dev.varar.conformance.bundle12;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code
 * 12-combining-marks}) — proves UTF-16 span offsets survive combining-mark
 * characters in the example prose; the step registration itself is unremarkable.
 */
public final class GreetSteps implements StepDefinitions<GreetSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor("I greet {string}", (Ctx ctx, String name) -> null);
    }
}
