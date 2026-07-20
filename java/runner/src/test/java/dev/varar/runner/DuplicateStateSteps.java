package dev.varar.runner;

import dev.varar.State;
import dev.varar.StepDefinitions;

/**
 * Two static factories in ONE source file: both load units' steps report the
 * same expressionSourceFile ("DuplicateStateSteps.java"), so their two state
 * factories would silently overwrite each other in the per-file context map —
 * StepLoader must reject this ("one steps per step-definition file").
 */
public final class DuplicateStateSteps {

    private DuplicateStateSteps() {}

    record Ctx() implements State {}

    public static StepDefinitions<Ctx> first() {
        return s -> {
            s.state(Ctx::new);
            s.stimulus("the first duplicate-file step", (Ctx ctx) -> ctx);
        };
    }

    public static StepDefinitions<Ctx> second() {
        return s -> {
            s.state(Ctx::new);
            s.stimulus("the second duplicate-file step", (Ctx ctx) -> ctx);
        };
    }
}
