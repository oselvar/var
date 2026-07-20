package dev.varar.junit.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Two expressions that both match "I have 5 cukes" — an ambiguous-match plan diagnostic (Task
 * 16), mirroring conformance bundle {@code 05-ambiguous-match}'s {@code CukesSteps} fixture (a
 * separate copy, not shared, since test sources aren't visible across Maven modules). Paired
 * with {@code examplefixture/ambiguous.md}.
 */
public final class AmbiguousSteps implements StepDefinitions<AmbiguousSteps.Ctx> {

    public record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);
        s.stimulus("I have {int} cukes", (Ctx ctx, Integer n) -> ctx);
        s.stimulus("I have 5 cukes", (Ctx ctx) -> ctx);
    }
}
