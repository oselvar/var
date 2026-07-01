package com.oselvar.var.core;

/**
 * A source position/range, anchored to UTF-16 code-unit offsets into a source
 * string (1-based line/column, matching editor conventions).
 *
 * <p>Port of {@code var-core/src/span.ts}. Java's {@code String}/{@code char}
 * are already UTF-16 code-unit indexed — like JavaScript, and unlike Python —
 * so, unlike the Python port, no code-point/UTF-16 conversion layer is needed
 * here: {@code startOffset}/{@code endOffset} are plain {@code String} offsets
 * throughout.
 */
public record Span(
        int startOffset, int endOffset, int startLine, int startCol, int endLine, int endCol) {

    /** A line/column position (1-based), as returned by {@link #lineCol}. */
    public record LineCol(int line, int col) {}

    /** Computes a {@link Span} for {@code [startOffset, endOffset)} into {@code source}. */
    public static Span spanFromOffsets(String source, int startOffset, int endOffset) {
        LineCol start = lineCol(source, startOffset);
        LineCol end = lineCol(source, endOffset);
        return new Span(
                startOffset, endOffset, start.line(), start.col(), end.line(), end.col());
    }

    /** Computes the 1-based (line, col) at {@code offset} (a UTF-16 code-unit index) into {@code source}. */
    public static LineCol lineCol(String source, int offset) {
        int line = 1;
        int col = 1;
        for (int i = 0; i < offset; i++) {
            if (source.charAt(i) == '\n') {
                line++;
                col = 1;
            } else {
                col++;
            }
        }
        return new LineCol(line, col);
    }
}
