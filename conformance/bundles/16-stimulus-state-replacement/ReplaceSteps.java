package dev.varar.conformance.bundle16;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code replace.steps.ts} (bundle {@code 16-stimulus-state-replacement}).
 *
 * <p>The second stimulus builds a {@code Ctx} carrying only {@code b}; {@code a} falls back to 0.
 * The record shape makes full replacement the only expressible contract here — which is precisely
 * why this bundle's golden pins the dynamic ports (TypeScript, Python, Ruby) to the same answer.
 */
public final class ReplaceSteps implements StepDefinitions<ReplaceSteps.Ctx> {

    record Ctx(int a, int b) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0, 0));

        s.stimulus("I set a to 1 and b to 2", (Ctx ctx) -> new Ctx(1, 2));

        s.stimulus("I set only b to 3", (Ctx ctx) -> new Ctx(0, 3));

        s.sensor("Then a is {int} and b is {int}", (Ctx ctx, Integer a, Integer b) ->
                java.util.List.of(ctx.a(), ctx.b()));
    }
}
