package dev.varar.junit.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * A {@code state} fixture whose {@code action} step is ADDITIVE (unlike {@link
 * WidgetSteps}' absolute-set {@code context} step) — used by {@code
 * VarExampleDescriptorExecutionTest} to prove state does NOT leak between two examples in
 * the same file: if a second example's initial state were anything other than the fresh
 * {@code Ctx(0)} {@link Steps#defineState} produces, its counter would come out wrong,
 * not merely "still correct by coincidence" (the risk an absolute-set step like {@code
 * WidgetSteps}' can't expose).
 */
public final class CounterSteps implements StepDefinitions<CounterSteps.Ctx> {

    public record Ctx(int count) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0));
        s.stimulus("I add {int} to the counter", (Ctx ctx, Integer n) -> new Ctx(ctx.count() + n));
        s.sensor("the counter should be {int}", (Ctx ctx, Integer expected) -> ctx.count());
    }
}
