package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/step-role.test.ts}. */
class StepRoleTest {

    @Test
    void noStepAfterTheSelectionMeansSensorExpectationLast() {
        var neighbours = new StepRole.Neighbours(List.of(StepKind.ACTION), List.of());
        assertEquals(StepKind.SENSOR, StepRole.inferStepRole(neighbours));
    }

    @Test
    void aSensorFollowsAndNoActionSitsBetweenMeansAction() {
        var neighbours = new StepRole.Neighbours(List.of(StepKind.CONTEXT), List.of(StepKind.SENSOR));
        assertEquals(StepKind.ACTION, StepRole.inferStepRole(neighbours));
    }

    @Test
    void nothingBeforeAndAStepAfterMeansContext() {
        var neighbours = new StepRole.Neighbours(List.of(), List.of(StepKind.ACTION));
        assertEquals(StepKind.CONTEXT, StepRole.inferStepRole(neighbours));
    }

    @Test
    void otherwiseMeansAction() {
        var neighbours = new StepRole.Neighbours(List.of(StepKind.ACTION), List.of(StepKind.ACTION));
        assertEquals(StepKind.ACTION, StepRole.inferStepRole(neighbours));
    }
}
