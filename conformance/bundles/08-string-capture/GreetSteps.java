package dev.varar.conformance.bundle08;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/** Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code 08-string-capture}). */
public final class GreetSteps implements StepDefinitions<GreetSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.stimulus("I greet {string}", (Ctx ctx, String name) -> ctx);
    }
}
