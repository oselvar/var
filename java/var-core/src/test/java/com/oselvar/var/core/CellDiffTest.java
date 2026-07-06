package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/cell-diff.test.ts}. */
class CellDiffTest {

    private static final Span SPAN = new Span(0, 1, 1, 1, 1, 2);
    private static final List<CellDiff.RowCheck> CHECKS =
            List.of(new CellDiff.RowCheck("dice", "3, 3, 3, 4, 4", SPAN), new CellDiff.RowCheck("score", "9", SPAN));

    @Test
    void aReturnedColumnThatMatchesItsCellIsOk() {
        List<CellDiff> diffs = CellDiff.compareRow(Map.of("score", 9), CHECKS);
        assertEquals(List.of(new CellDiff("score", SPAN, "9", "9", true)), diffs);
    }

    @Test
    void aReturnedColumnThatDiffersIsNotOkWithExpectedAndActual() {
        List<CellDiff> diffs = CellDiff.compareRow(Map.of("score", 6), CHECKS);
        assertEquals(List.of(new CellDiff("score", SPAN, "9", "6", false)), diffs);
    }

    @Test
    void columnsThatAreNotReturnedAreInputsNotChecked() {
        // `dice` is never returned, so it never appears in the diffs.
        assertEquals(
                List.of("score"),
                CellDiff.compareRow(Map.of("score", 9), CHECKS).stream()
                        .map(CellDiff::column)
                        .toList());
    }

    @Test
    void aReturnedKeyThatIsNotAColumnIsIgnored() {
        assertEquals(List.of(), CellDiff.compareRow(Map.of("nope", 1), CHECKS));
    }

    @Test
    void nullNonMapReturnChecksNothing() {
        assertEquals(List.of(), CellDiff.compareRow(null, CHECKS));
        assertEquals(List.of(), CellDiff.compareRow(42, CHECKS));
    }

    @Test
    void cellMismatchExceptionCarriesTheCellsAndIsDetectable() {
        CellDiff.CellMismatchException err =
                new CellDiff.CellMismatchException(List.of(new CellDiff("score", SPAN, "9", "6", false)));
        assertTrue(CellDiff.isCellMismatchException(err));
        assertFalse(CellDiff.isCellMismatchException(new RuntimeException("x")));
        assertEquals("6", err.cells().get(0).actual());
        assertTrue(err.getMessage().contains("score"));
    }

    // Build a real Table (with cellSpans) by parsing a markdown table.
    private record ParsedTable(Ast.Table table, String source) {}

    private static ParsedTable tableOf(String source) {
        Ast.VarDoc doc = Parse.parse("t.md", source);
        Ast.Table table = doc.examples().get(0).body().stream()
                .filter(b -> b instanceof Ast.Table)
                .map(b -> (Ast.Table) b)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("no table parsed"));
        return new ParsedTable(table, source);
    }

    private static final String TABLE_SRC = """
            # T

            these:

            | before | after |
            | ------ | ----- |
            | var    | VAR   |
            | bdd    | BDD   |""";

    @Test
    void compareTableArrayOfArraysFullMatchAllOk() {
        Ast.Table table = tableOf(TABLE_SRC).table();
        List<CellDiff> diffs = CellDiff.compareTable(List.of(List.of("var", "VAR"), List.of("bdd", "BDD")), table);
        assertEquals(4, diffs.size());
        assertTrue(diffs.stream().allMatch(CellDiff::ok));
    }

    @Test
    void compareTableArrayOfRecordsFullMatchAllOk() {
        Ast.Table table = tableOf(TABLE_SRC).table();
        List<CellDiff> diffs = CellDiff.compareTable(
                List.of(Map.of("before", "var", "after", "VAR"), Map.of("before", "bdd", "after", "BDD")), table);
        assertTrue(diffs.stream().allMatch(CellDiff::ok));
    }

    @Test
    void compareTableOneWrongCellNotOkWithExpectedActualSpan() {
        ParsedTable parsed = tableOf(TABLE_SRC);
        List<CellDiff> diffs =
                CellDiff.compareTable(List.of(List.of("var", "WRONG"), List.of("bdd", "BDD")), parsed.table());
        List<CellDiff> bad = diffs.stream().filter(d -> !d.ok()).toList();
        assertEquals(1, bad.size());
        assertEquals("after", bad.get(0).column());
        assertEquals("VAR", bad.get(0).expected());
        assertEquals("WRONG", bad.get(0).actual());
        assertEquals(
                "VAR",
                parsed.source()
                        .substring(
                                bad.get(0).span().startOffset(),
                                bad.get(0).span().endOffset()));
    }

    @Test
    void compareTableNumbersAreStringifiedBeforeCompare() {
        Ast.Table table = tableOf("""
                                # T

                                these:

                                | n |
                                | - |
                                | 7 |""").table();
        assertTrue(CellDiff.compareTable(List.of(List.of(7)), table).stream().allMatch(CellDiff::ok));
    }

    @Test
    void compareTableNullReturnChecksNothing() {
        Ast.Table table = tableOf(TABLE_SRC).table();
        assertEquals(List.of(), CellDiff.compareTable(null, table));
    }

    @Test
    void compareTableExtraKeysOnAReturnedRecordAreIgnored() {
        Ast.Table table = tableOf(TABLE_SRC).table();
        List<CellDiff> diffs = CellDiff.compareTable(
                List.of(
                        Map.of("before", "var", "after", "VAR", "extra", "ignored"),
                        Map.of("before", "bdd", "after", "BDD", "note", 123)),
                table);
        assertTrue(diffs.stream().allMatch(CellDiff::ok));
        assertEquals(
                List.of("before", "after", "before", "after"),
                diffs.stream().map(CellDiff::column).toList());
    }

    @Test
    void compareTableShapeTypeErrorsThrowReturnShapeException() {
        Ast.Table table = tableOf(TABLE_SRC).table();
        assertThrows(CellDiff.ReturnShapeException.class, () -> CellDiff.compareTable("nope", table)); // not a list
        assertThrows(
                CellDiff.ReturnShapeException.class,
                () -> CellDiff.compareTable(List.of(List.of("var", "VAR")), table)); // wrong row count
        assertThrows(
                CellDiff.ReturnShapeException.class,
                () -> CellDiff.compareTable(List.of(List.of("var"), List.of("bdd")), table)); // wrong width
        assertThrows(
                CellDiff.ReturnShapeException.class,
                () -> CellDiff.compareTable(
                        List.of(Map.of("before", "var"), Map.of("before", "bdd")), table)); // missing key
        assertThrows(
                CellDiff.ReturnShapeException.class,
                () -> CellDiff.compareTable(
                        List.of(List.of("var", "VAR"), Map.of("before", "bdd", "after", "BDD")), table)); // mixed forms
    }
}
