package com.oselvar.var.runner;

import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Two static factories in ONE source file: both load units' steps report the
 * same expressionSourceFile ("DuplicateStateSteps.java"), so their two state
 * factories would silently overwrite each other in the per-file context map —
 * StepLoader must reject this ("one defineState per step-definition file").
 */
public final class DuplicateStateSteps {

    private DuplicateStateSteps() {}

    record Ctx() implements State {}

    public static StepDefinitions first() {
        return registrar -> {
            StateBinder<Ctx> s = registrar.defineState(Ctx::new);
            s.action("the first duplicate-file step", (Ctx ctx) -> ctx);
        };
    }

    public static StepDefinitions second() {
        return registrar -> {
            StateBinder<Ctx> s = registrar.defineState(Ctx::new);
            s.action("the second duplicate-file step", (Ctx ctx) -> ctx);
        };
    }
}
