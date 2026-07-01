package com.oselvar.var.conformance.bundle04;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Java sibling of {@code echo.steps.ts} / {@code echo.steps.py} (bundle {@code
 * 04-tables-and-docstrings}).
 *
 * <p>The TS/Python originals receive the doc string as a trailing argument after the
 * expression's own captures ({@code (ctx, doc) => [doc]}) and return it so the pure
 * core's {@code compareDocString} can check it against the source doc string. Java's
 * executor ({@code Execute}, Task 18) passes the doc string the same way — as the last
 * handler argument, after any inline captures — so this sensor takes it explicitly and
 * echoes it back verbatim; equal content passes.
 */
public final class EchoSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.sensor("I echo the following:", (Ctx ctx, String doc) -> doc);
    }
}
