package com.oselvar.var.runner.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;

/**
 * A standalone (top-level, own-file) {@link StepDefinitions} fixture for {@code
 * RenderTest} — registers one {@code action} that unconditionally throws a plain
 * {@link RuntimeException}, so a real spec produces a genuine arbitrary-{@code
 * Throwable} failure (no {@code cells}/{@code doc}, per {@code
 * Failure.toFailure}) for {@code Render} to format via its message-only fallback.
 */
public final class BoomSteps implements StepDefinitions {

    public record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.steps(Ctx::new);
        s.stimulus("something explodes", (Ctx ctx) -> {
            throw new RuntimeException("boom");
        });
    }
}
