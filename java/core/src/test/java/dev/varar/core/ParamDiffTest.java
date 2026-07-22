package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/param-diff.test.ts}. */
class ParamDiffTest {

    private static final String SOURCE = "I should have 3 cukes in my big belly";

    private static Span span(int start, int end) {
        return Span.spanFromOffsets(SOURCE, start, end);
    }

    @Test
    void allElementsEqualEveryCellOk() {
        List<CellDiff> diffs = ParamDiff.compareParams(
                List.of(3, "big"), List.of(3, "big"), List.of(span(14, 15), span(31, 34)), List.of("3", "big"));
        assertTrue(diffs.stream().allMatch(CellDiff::ok));
    }

    @Test
    void oneMismatchingElementThatCellIsNotOkWithExpectedActual() {
        List<CellDiff> diffs = ParamDiff.compareParams(
                List.of(4, "big"), List.of(3, "big"), List.of(span(14, 15), span(31, 34)), List.of("3", "big"));
        assertEquals("cell 1", diffs.get(0).column());
        assertEquals("3", diffs.get(0).expected());
        assertEquals("4", diffs.get(0).actual());
        assertFalse(diffs.get(0).ok());
        assertEquals("cell 2", diffs.get(1).column());
        assertTrue(diffs.get(1).ok());
    }

    @Test
    void objectActualsCompareStructurallyAcrossReferences() {
        List<CellDiff> diffs = ParamDiff.compareParams(
                List.of(Map.of("iso", "NO")), List.of(Map.of("iso", "NO")), List.of(span(0, 2)), List.of("NO"));
        assertTrue(diffs.get(0).ok());
    }
}
