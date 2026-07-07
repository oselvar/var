package com.oselvar.var.junit.fixtures;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StepDefinitions;

/**
 * A small standalone (top-level, own-file) {@link StepDefinitions} fixture used by {@code
 * var-junit}'s discovery tests to prove a real {@code .md} spec plans into leaf {@link
 * com.oselvar.var.junit.VarExampleDescriptor}s — one {@code context} step that sets a widget
 * count, one {@code sensor} step that reports it, mirroring {@code var-runner}'s own {@code
 * WidgetSteps} fixture (a separate copy, not shared, since test sources aren't visible across
 * Maven modules).
 */
public final class WidgetSteps implements StepDefinitions {

    public record Ctx(int count) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.steps(() -> new Ctx(0));
        s.stimulus("I have {int} widgets", (Ctx ctx, Integer n) -> new Ctx(n));
        s.sensor("I should have {int} widgets", (Ctx ctx, Integer expected) -> ctx.count());
    }
}
