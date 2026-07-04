package examples;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

public final class HelloVarSteps implements StepDefinitions {

    record Ctx(String greeting, int result) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx("", 0));

        s.stimulus("I greet {string}", (Ctx ctx, String name) -> new Ctx("Hello, " + name + "!", ctx.result()));
        s.sensor("the greeting should be {string}", (Ctx ctx, String expected) -> ctx.greeting());
        s.stimulus("expression `{int}+{int}`", (Ctx ctx, Integer a, Integer b) -> new Ctx(ctx.greeting(), a + b));
        s.sensor("evaluate to `{int}`", (Ctx ctx, Integer expected) -> ctx.result());
    }
}
