package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * A standalone (top-level, own-file) {@link StepDefinitions} fixture for {@code
 * RenderTest} — registers one {@code action} that unconditionally throws a plain
 * {@link RuntimeException}, so a real spec produces a genuine arbitrary-{@code
 * Throwable} failure (no {@code cells}/{@code doc}, per {@code
 * Failure.toFailure}) for {@code Render} to format via its message-only fallback.
 */
public final class BoomSteps implements StepDefinitions<BoomSteps.Ctx> {

    public record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);
        s.stimulus("something explodes", (Ctx ctx) -> {
            throw new RuntimeException("boom");
        });
    }
}
