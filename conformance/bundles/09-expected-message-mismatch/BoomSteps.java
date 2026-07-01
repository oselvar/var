package com.oselvar.var.conformance.bundle09;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Java sibling of {@code boom.steps.ts} / {@code boom.steps.py} (bundle {@code
 * 09-expected-message-mismatch}). Throws a message that does NOT contain the expected
 * substring "expected message", so the expected-failure is NOT satisfied and the
 * example fails at the trace stage.
 */
public final class BoomSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.action(
                "I always boom",
                (Ctx ctx) -> {
                    throw new RuntimeException("actual different error");
                });
    }
}
