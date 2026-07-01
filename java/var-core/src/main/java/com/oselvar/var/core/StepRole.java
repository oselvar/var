package com.oselvar.var.core;

import java.util.List;

/**
 * Port of {@code var-core/src/step-role.ts}: guess a step's role from its neighbours in
 * document order.
 */
public final class StepRole {

    private StepRole() {}

    /**
     * The kinds of the steps immediately {@code before} and {@code after} the step being
     * inferred, in document order.
     */
    public record Neighbours(List<StepKind> before, List<StepKind> after) {
        public Neighbours {
            before = List.copyOf(before);
            after = List.copyOf(after);
        }
    }

    /**
     * Guesses a step's role from its neighbours, using the canonical document order
     * context &rarr; action &rarr; sensor. Purely structural — never inspects sentence
     * words (no Given/When/Then heuristics). The generated snippet always offers the
     * other roles as commented alternatives, so a wrong guess is cheap to correct.
     */
    public static StepKind inferStepRole(Neighbours neighbours) {
        List<StepKind> before = neighbours.before();
        List<StepKind> after = neighbours.after();
        if (after.isEmpty()) {
            return StepKind.SENSOR;
        }
        if (after.contains(StepKind.SENSOR)
                && !before.contains(StepKind.ACTION)
                && !after.contains(StepKind.ACTION)) {
            return StepKind.ACTION;
        }
        if (before.isEmpty()) {
            return StepKind.CONTEXT;
        }
        return StepKind.ACTION;
    }
}
