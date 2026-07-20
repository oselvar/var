package examples;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

public final class DeepThoughtSteps implements StepDefinitions<DeepThoughtSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor("life, the universe and everything is {int}", (Ctx ctx, Integer answer) -> 42);
    }
}
