package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.TableCells.RowCells;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Port of the table-row-cell-parsing behavior of {@code table-cells.ts}, cross-checked against
 * {@code python/packages/var-core/tests/test_table_cells.py} (which in turn ports the table-cell
 * span cases of {@code var-core/tests/scanner.test.ts}).
 */
class TableCellsTest {

    @Test
    void basicRowReturnsTrimmedCells() {
        String source = "| a | b |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of("a", "b"), result.cells());
    }

    @Test
    void basicRowSpansPointToTrimmedText() {
        String source = "| a | b |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(2, result.cellSpans().size());
        assertEquals("a", slice(source, result.cellSpans().get(0)));
        assertEquals("b", slice(source, result.cellSpans().get(1)));
    }

    @Test
    void extraPaddingIsTrimmed() {
        String source = "| Bob  | 30  |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of("Bob", "30"), result.cells());
        assertEquals("Bob", slice(source, result.cellSpans().get(0)));
        assertEquals("30", slice(source, result.cellSpans().get(1)));
    }

    @Test
    void noPipeReturnsEmpty() {
        String source = "hello world";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of(), result.cells());
        assertEquals(List.of(), result.cellSpans());
    }

    @Test
    void singlePipeReturnsEmpty() {
        String source = "| only one";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of(), result.cells());
        assertEquals(List.of(), result.cellSpans());
    }

    @Test
    void singleColumnTableRow() {
        String source = "| n |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of("n"), result.cells());
        assertEquals("n", slice(source, result.cellSpans().get(0)));
    }

    @Test
    void lineStartOffsetShiftsSpans() {
        String prefix = "# T\n\n";
        String row = "| a | b |";
        String source = prefix + row;
        int lineStart = prefix.length();
        RowCells result = TableCells.parseRowCells(row, lineStart, source);
        assertEquals(List.of("a", "b"), result.cells());
        assertEquals("a", slice(source, result.cellSpans().get(0)));
        assertEquals("b", slice(source, result.cellSpans().get(1)));
    }

    /**
     * A cell containing an astral character (U+1F389, a surrogate pair — 2 UTF-16 code units)
     * must shift the following cell's span by 2, not 1. Java's {@code String}/{@code char} are
     * already UTF-16 code-unit indexed (see {@link Span}'s javadoc), so this needs no conversion
     * layer — unlike the Python port, which reconstructs UTF-16 offsets explicitly.
     */
    @Test
    void astralCellShiftsFollowingSpan() {
        String source = "| 🎉 | a |"; // U+1F389 PARTY POPPER
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of("🎉", "a"), result.cells());
        assertEquals(2, result.cellSpans().get(0).startOffset());
        assertEquals(4, result.cellSpans().get(0).endOffset());
        assertEquals(7, result.cellSpans().get(1).startOffset());
        assertEquals(8, result.cellSpans().get(1).endOffset());
        assertEquals("🎉", slice(source, result.cellSpans().get(0)));
        assertEquals("a", slice(source, result.cellSpans().get(1)));
    }

    @Test
    void threeColumnRow() {
        String source = "| name | age | city |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of("name", "age", "city"), result.cells());
        assertEquals("name", slice(source, result.cellSpans().get(0)));
        assertEquals("age", slice(source, result.cellSpans().get(1)));
        assertEquals("city", slice(source, result.cellSpans().get(2)));
    }

    @Test
    void delimiterRowGivesDashes() {
        String source = "| --- | --- |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertEquals(List.of("---", "---"), result.cells());
    }

    @Test
    void cellsListIsImmutable() {
        String source = "| a | b |";
        RowCells result = TableCells.parseRowCells(source, 0, source);
        assertTrue(result.cells() instanceof List);
        assertEquals(UnsupportedOperationException.class, unsupportedOnAdd(result));
    }

    private static Class<?> unsupportedOnAdd(RowCells result) {
        try {
            result.cells().add("x");
            return null;
        } catch (UnsupportedOperationException e) {
            return e.getClass();
        }
    }

    private static String slice(String source, Span span) {
        return source.substring(span.startOffset(), span.endOffset());
    }
}
