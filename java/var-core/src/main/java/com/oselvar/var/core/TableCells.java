package com.oselvar.var.core;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses a Markdown/Gherkin table row line ({@code | a | b |}) into trimmed cell text plus the
 * source span of each cell's trimmed text.
 *
 * <p>Port of {@code var-core/src/table-cells.ts}. Java's {@code String}/{@code char} are already
 * UTF-16 code-unit indexed (see {@link Span}'s javadoc), so — unlike the Python port ({@code
 * var_core/table_cells.py}), which must reconstruct UTF-16 offsets from its code-point-indexed
 * strings — this iterates and slices directly on {@code String} offsets, exactly as {@code
 * table-cells.ts} does.
 */
public final class TableCells {

    private TableCells() {}

    /** {@code cells} and {@code cellSpans} are parallel, same-length lists. */
    public record RowCells(List<String> cells, List<Span> cellSpans) {
        public RowCells {
            cells = List.copyOf(cells);
            cellSpans = List.copyOf(cellSpans);
        }
    }

    /**
     * Splits a {@code | a | b |} table row into trimmed cells and the source span of each cell's
     * trimmed text. Works for Markdown rows (no leading space) and indented Gherkin rows alike.
     * {@code lineStartOffset} is the row's start offset in {@code source}.
     */
    public static RowCells parseRowCells(String lineText, int lineStartOffset, String source) {
        int first = lineText.indexOf('|');
        int last = lineText.lastIndexOf('|');
        if (first < 0 || last <= first) {
            return new RowCells(List.of(), List.of());
        }
        String inner = lineText.substring(first + 1, last);
        int innerStart = first + 1;
        List<String> cells = new ArrayList<>();
        List<Span> cellSpans = new ArrayList<>();
        int cursor = 0;
        for (String seg : splitOnPipe(inner)) {
            String trimmed = seg.strip();
            int leading = seg.length() - seg.stripLeading().length();
            int absStart = lineStartOffset + innerStart + cursor + leading;
            cells.add(trimmed);
            cellSpans.add(Span.spanFromOffsets(source, absStart, absStart + trimmed.length()));
            cursor += seg.length() + 1; // +1 for the '|' delimiter
        }
        return new RowCells(cells, cellSpans);
    }

    /**
     * Splits {@code text} on {@code '|'}, mirroring JavaScript's {@code String.prototype.split}:
     * unlike {@link String#split}, it never drops trailing empty segments.
     */
    private static List<String> splitOnPipe(String text) {
        List<String> parts = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '|') {
                parts.add(text.substring(start, i));
                start = i + 1;
            }
        }
        parts.add(text.substring(start));
        return parts;
    }
}
