package com.oselvar.var.runner;

import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Fixture for StepLoader's static-factory path: does NOT implement
 * StepDefinitions; exposes a public static no-arg factory instead — the plain-
 * Java shape of what a Kotlin top-level `val steps = steps(...) {...}`
 * compiles to (a file-facade class with a static getSteps()).
 */
public final class StaticFactorySteps {

    private StaticFactorySteps() {}

    record Ctx() implements State {}

    public static StepDefinitions steps() {
        return registrar -> {
            StateBinder<Ctx> s = registrar.steps(Ctx::new);
            s.stimulus("I do a static-factory thing", (Ctx ctx) -> ctx);
        };
    }
}
