package com.oselvar.var.conformance.bundle11;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.List;

/**
 * Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code
 * 11-emoji-offsets}) — proves UTF-16 span offsets survive astral characters (emoji)
 * in the example prose; the step registration itself is unremarkable.
 *
 * <p>The {@code example.md}'s trailing table (headers {@code Café}/{@code 日本語}) isn't
 * header-bound (neither header cell appears as a word in "I greet ..."), so {@code Plan}
 * attaches it to this step as a plain trailing data table — the handler must accept it
 * positionally (after the {@code {string}} capture) even though it returns {@code null}
 * (mirrors TS/Python's {@code sensor('I greet {string}', () => undefined)}: a {@code
 * null}/{@code undefined} return skips every comparison, table included, so the
 * attachment is present but never actually checked).
 */
public final class GreetSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.sensor(
                "I greet {string}",
                (Ctx ctx, String name, List<List<String>> table) -> null);
    }
}
