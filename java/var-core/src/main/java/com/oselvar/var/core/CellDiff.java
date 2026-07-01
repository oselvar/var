package com.oselvar.var.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Table row/cell comparison — port of {@code var-core/src/cell-diff.ts}.
 *
 * <p>{@code CellDiff} itself is the verdict for one checked column after comparing a step's
 * returned value against the authored Markdown cells: {@link #compareRow} produces these for a
 * header-bound row (only the columns the step actually returns are checked), {@link
 * #compareTable} for a whole reproduced table (every column of every data row is checked).
 *
 * <p>A step's returned value has no static shape in this hexagonal core (it crosses from
 * user-authored step handlers), so {@code returned} is {@code Object} here and is narrowed via
 * {@code instanceof Map}/{@code instanceof List} — the same duck-typing {@code cell-diff.ts} does
 * with {@code typeof}/{@code Array.isArray}. A returned "row object" is therefore expected as a
 * {@link Map} (keyed by column name); a returned "table" as a {@link List} of {@link List}
 * (positional) or a {@link List} of {@link Map} (keyed by header cell) — mirroring the {@code
 * Map<String, Object>} convention already used for JSON-object-shaped values elsewhere in this
 * port (see {@code CanonicalJson}).
 */
public record CellDiff(String column, Span span, String expected, String actual, boolean ok) {

    /** One checked column of one header-bound row: the input the comparison needs. */
    public record RowCheck(String column, String value, Span span) {}

    /**
     * Compares a row step's returned value against the row's cells. Only columns present on
     * {@code returned} (expected to be a {@link Map}) are checked; the rest are inputs. A
     * non-map return (including {@code null}) checks nothing.
     */
    public static List<CellDiff> compareRow(Object returned, List<RowCheck> checks) {
        if (!(returned instanceof Map<?, ?> obj)) return List.of();
        List<CellDiff> diffs = new ArrayList<>();
        for (RowCheck check : checks) {
            if (!obj.containsKey(check.column())) continue;
            String actual = String.valueOf(obj.get(check.column()));
            diffs.add(
                    new CellDiff(
                            check.column(),
                            check.span(),
                            check.value(),
                            actual,
                            actual.equals(check.value())));
        }
        return List.copyOf(diffs);
    }

    /**
     * Thrown by the executor when a header-bound row's returned columns don't all match. Carries
     * the mismatched cells so adapters render/record them.
     */
    public static final class CellMismatchException extends RuntimeException {
        private final List<CellDiff> cells;

        public CellMismatchException(List<CellDiff> cells) {
            super(message(cells));
            this.cells = List.copyOf(cells);
        }

        public List<CellDiff> cells() {
            return cells;
        }

        private static String message(List<CellDiff> cells) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < cells.size(); i++) {
                if (i > 0) sb.append("; ");
                CellDiff c = cells.get(i);
                sb.append(c.column())
                        .append(": expected ")
                        .append(c.expected())
                        .append(" but was ")
                        .append(c.actual());
            }
            return sb.toString();
        }
    }

    /** Type-guard helper mirroring {@code isCellMismatchError} in {@code cell-diff.ts}. */
    public static boolean isCellMismatchException(Throwable e) {
        return e instanceof CellMismatchException;
    }

    /**
     * The step returned the wrong TYPE (a non-list where a table was input, a non-string where a
     * doc string was input) or wrong SHAPE (row/column count, missing record key, mixed row
     * forms). An author mistake, not a value diff.
     */
    public static final class ReturnShapeException extends RuntimeException {
        public ReturnShapeException(String message) {
            super(message);
        }
    }

    /**
     * Compares a whole-table step's returned table against the input table, full reproduction:
     * every column of every data row is checked (the header row is labels, never compared).
     * {@code returned} may be a {@code List} of {@code List} (data rows, positional) or a {@code
     * List} of {@code Map} (keyed by header cell). Cells compare as exact strings ({@code
     * String.valueOf(value).equals(cellText)}). {@code null} → no checks. Type/shape problems
     * throw {@link ReturnShapeException}.
     */
    public static List<CellDiff> compareTable(Object returned, Ast.Table input) {
        if (returned == null) return List.of();
        if (!(returned instanceof List<?> rows)) {
            throw new ReturnShapeException(
                    "expected a table (array of rows), got " + typeName(returned));
        }
        List<String> columns = input.header().cells();
        List<Ast.Row> dataRows = input.rows();
        if (rows.size() != dataRows.size()) {
            throw new ReturnShapeException("expected " + dataRows.size() + " row(s), got " + rows.size());
        }
        boolean allArrays = rows.stream().allMatch(r -> r instanceof List<?>);
        boolean allRecords = rows.stream().allMatch(r -> r instanceof Map<?, ?>);
        if (!allArrays && !allRecords) {
            throw new ReturnShapeException("table rows must be all arrays or all objects");
        }
        List<CellDiff> diffs = new ArrayList<>();
        for (int i = 0; i < dataRows.size(); i++) {
            Ast.Row row = dataRows.get(i);
            Object ret = rows.get(i);
            if (allArrays) {
                List<?> cells = (List<?>) ret;
                if (cells.size() != columns.size()) {
                    throw new ReturnShapeException(
                            "row " + i + ": expected " + columns.size() + " column(s), got " + cells.size());
                }
            }
            for (int j = 0; j < columns.size(); j++) {
                String column = columns.get(j);
                Object actualValue;
                if (allArrays) {
                    actualValue = ((List<?>) ret).get(j);
                } else {
                    Map<?, ?> rec = (Map<?, ?>) ret;
                    if (!rec.containsKey(column)) {
                        throw new ReturnShapeException("row " + i + ": missing column \"" + column + "\"");
                    }
                    actualValue = rec.get(column);
                }
                String expected = j < row.cells().size() ? row.cells().get(j) : "";
                String actual = String.valueOf(actualValue);
                Span span = j < row.cellSpans().size() ? row.cellSpans().get(j) : row.span();
                diffs.add(new CellDiff(column, span, expected, actual, actual.equals(expected)));
            }
        }
        return List.copyOf(diffs);
    }

    private static String typeName(Object o) {
        return o.getClass().getSimpleName();
    }
}
