package dev.varar.conformance.bundle05;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code cukes.steps.ts} / {@code cukes.steps.py} (bundle {@code
 * 05-ambiguous-match}). Both expressions match "I have 5 cukes" -&gt; ambiguous-match
 * diagnostic (a later, plan-stage concern; this stage only needs both registered).
 */
public final class CukesSteps implements StepDefinitions<CukesSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.stimulus("I have {int} cukes", (Ctx ctx, Integer n) -> ctx);
        s.stimulus("I have 5 cukes", (Ctx ctx) -> ctx);
    }
}
