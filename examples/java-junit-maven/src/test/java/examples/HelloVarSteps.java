package examples;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

public final class HelloVarSteps implements StepDefinitions<HelloVarSteps.Ctx> {

    record Ctx(String greeting, int result) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx("", 0));

        s.stimulus("I greet {string}", (Ctx ctx, String name) -> new Ctx("Hello, " + name + "!", ctx.result()));
        s.sensor("the greeting should be {string}", (Ctx ctx, String expected) -> ctx.greeting());
        s.stimulus("expression `{int}+{int}`", (Ctx ctx, Integer a, Integer b) -> new Ctx(ctx.greeting(), a + b));
        s.sensor("evaluate to `{int}`", (Ctx ctx, Integer expected) -> ctx.result());
    }
}
