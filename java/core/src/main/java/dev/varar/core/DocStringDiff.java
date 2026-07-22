package dev.varar.core;

/**
 * Doc-string comparison — port of {@code var-core/src/doc-string-diff.ts}.
 *
 * <p>A doc string is ONE CELL, compared whole, so a difference is an ordinary {@link CellDiff}
 * and the executor throws the same {@link CellDiff.CellMismatchException} as any other cell.
 */
public final class DocStringDiff {

    private DocStringDiff() {}

    /**
     * The column label a doc-string cell carries in a {@link CellDiff}, so its mismatch message
     * reads {@code doc string: expected … but was …}.
     */
    public static final String DOC_STRING_COLUMN = "doc string";

    /**
     * Compares a doc-string step's returned value against the fence body content. Exact equality
     * (the body includes its trailing newline). {@code null} → no check (the step asserted
     * nothing). A non-string return is an author mistake → {@link CellDiff.ReturnShapeException}.
     *
     * <p>{@code expected}/{@code actual} are quoted: a doc string routinely differs only in
     * whitespace, and bare text would render a missing trailing newline as no difference at all.
     */
    public static CellDiff compareDocString(Object returned, String content, Span span) {
        if (returned == null) return null;
        if (!(returned instanceof String s)) {
            throw new CellDiff.ReturnShapeException(
                    "expected a doc string (string), got " + returned.getClass().getSimpleName());
        }
        if (s.equals(content)) return null;
        return new CellDiff(DOC_STRING_COLUMN, span, quote(content), quote(s), false, null, null, false);
    }

    private static String quote(String s) {
        StringBuilder b = new StringBuilder(s.length() + 2);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\' -> b.append("\\\\");
                case '"' -> b.append("\\\"");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                case '\b' -> b.append("\\b");
                case '\f' -> b.append("\\f");
                default -> {
                    if (c < 0x20) {
                        b.append(String.format("\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
                }
            }
        }
        return b.append('"').toString();
    }
}
