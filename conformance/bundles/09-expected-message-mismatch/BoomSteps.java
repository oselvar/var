package dev.varar.conformance.bundle09;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code boom.steps.ts} / {@code boom.steps.py} (bundle {@code
 * 09-expected-message-mismatch}). Throws a message that does NOT contain the expected
 * substring "expected message", so the expected-failure is NOT satisfied and the
 * example fails at the trace stage.
 */
public final class BoomSteps implements StepDefinitions<BoomSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.stimulus(
                "I always boom",
                (Ctx ctx) -> {
                    throw new RuntimeException("actual different error");
                });
    }
}
