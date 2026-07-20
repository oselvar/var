package dev.varar.runner;

import dev.varar.State;
import dev.varar.StepDefinitions;

/**
 * Fixture for StepLoader's static-factory path: does NOT implement
 * StepDefinitions; exposes a public static no-arg factory instead — the plain-
 * Java shape of what a Kotlin top-level `val steps = steps(...) {...}`
 * compiles to (a file-facade class with a static getSteps()).
 */
public final class StaticFactorySteps {

    private StaticFactorySteps() {}

    record Ctx() implements State {}

    public static StepDefinitions<Ctx> steps() {
        return s -> {
            s.state(Ctx::new);
            s.stimulus("I do a static-factory thing", (Ctx ctx) -> ctx);
        };
    }
}
