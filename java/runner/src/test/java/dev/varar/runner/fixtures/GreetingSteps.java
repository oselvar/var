package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * A standalone (top-level, own-file) {@link StepDefinitions} fixture for {@code
 * RenderTest} — registers one zero-capture {@code sensor} whose handler receives the
 * attached doc-string body as its trailing argument (mirrors {@code
 * ExecuteTest}'s {@code GREETING_DOC} fixture in {@code var-core}) but returns a
 * deliberately wrong greeting, so a real spec produces a genuine {@code
 * CellDiff.CellMismatchException} for {@code Render} to format — not a
 * hand-built payload.
 */
public final class GreetingSteps implements StepDefinitions<GreetingSteps.Ctx> {

    public record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);
        s.sensor("the greeting is", (Ctx ctx, String body) -> "Goodbye!\n");
    }
}
