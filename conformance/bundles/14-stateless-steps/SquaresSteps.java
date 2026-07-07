package com.oselvar.var.conformance.bundle14;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.List;

/**
 * Java sibling of {@code squares.steps.ts} / {@code squares.steps.py} /
 * {@code squares.steps.kt} (bundle {@code 14-stateless-steps}): no state factory —
 * these steps are pure, so the factory-less {@code steps()} binds handlers to
 * {@link State.Empty}.
 */
public final class SquaresSteps implements StepDefinitions {

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<State.Empty> s = registrar.steps();

        s.stimulus("I warm up my mental math", (State.Empty state) -> state);

        s.sensor(
                "The square of {int} is {int}.",
                (State.Empty state, Integer n, Integer expected) -> List.of(n, n * n));
    }
}
