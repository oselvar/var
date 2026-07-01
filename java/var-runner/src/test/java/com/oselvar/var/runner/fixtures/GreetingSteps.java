package com.oselvar.var.runner.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;

/**
 * A standalone (top-level, own-file) {@link StepDefinitions} fixture for {@code
 * RenderTest} — registers one zero-capture {@code sensor} whose handler receives the
 * attached doc-string body as its trailing argument (mirrors {@code
 * ExecuteTest}'s {@code GREETING_DOC} fixture in {@code var-core}) but returns a
 * deliberately wrong greeting, so a real spec produces a genuine {@code
 * DocStringDiff.DocStringMismatchException} for {@code Render} to format — not a
 * hand-built payload.
 */
public final class GreetingSteps implements StepDefinitions {

    public record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.defineState(Ctx::new);
        s.sensor("the greeting is", (Ctx ctx, String body) -> "Goodbye!\n");
    }
}
