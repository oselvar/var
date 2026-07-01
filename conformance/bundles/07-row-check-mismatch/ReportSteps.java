package com.oselvar.var.conformance.bundle07;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Map;

/**
 * Java sibling of {@code report.steps.ts} / {@code report.steps.py} (bundle {@code
 * 07-row-check-mismatch}). Header-bound row step: returns its computed columns as a
 * {@code Map<String, String>} (column name -&gt; value) for the core to diff cell-by-
 * cell against the table row (the {@code rowChecks} path) — score 99 != 10 in the
 * example, producing a {@code CellMismatchException} at the trace stage.
 *
 * <p>{@code Plan}'s header-bound expansion appends the current row (also a {@code
 * Map<String, String>}, keyed by header cell) as a trailing positional argument after
 * whatever the expression itself captured (here: nothing) — so the handler takes it,
 * even though this fixture ignores its value and always returns the same hardcoded
 * (wrong) columns.
 */
public final class ReportSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.sensor(
                "I report the score and grade",
                (Ctx ctx, Map<String, String> row) -> Map.of("score", "99", "grade", "A"));
    }
}
