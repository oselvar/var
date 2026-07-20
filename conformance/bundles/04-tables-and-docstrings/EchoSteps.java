package dev.varar.conformance.bundle04;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code echo.steps.ts} / {@code echo.steps.py} (bundle {@code
 * 04-tables-and-docstrings}).
 *
 * <p>The TS/Python originals receive the doc string as a trailing argument after the
 * expression's own captures ({@code (ctx, doc) => doc}) and return it bare (it is the
 * sensor's only slot) so the pure core's {@code compareDocString} can check it against
 * the source doc string. Java's
 * executor ({@code Execute}, Task 18) passes the doc string the same way — as the last
 * handler argument, after any inline captures — so this sensor takes it explicitly and
 * echoes it back verbatim; equal content passes.
 */
public final class EchoSteps implements StepDefinitions<EchoSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor("I echo the following:", (Ctx ctx, String doc) -> doc);
    }
}
