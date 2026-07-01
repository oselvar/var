package com.oselvar.var.core;

/**
 * Doc-string comparison — port of {@code var-core/src/doc-string-diff.ts}.
 *
 * <p>{@code DocStringDiff} is a content difference: the fence body's source range plus the
 * expected (authored) and actual (returned) strings.
 */
public record DocStringDiff(Span span, String expected, String actual) {

    /**
     * Compares a doc-string step's returned value against the fence body content. Exact equality
     * (the body includes its trailing newline). {@code null} → no check (the step asserted
     * nothing). A non-string return is an author mistake → {@link CellDiff.ReturnShapeException}.
     */
    public static DocStringDiff compareDocString(Object returned, String content, Span span) {
        if (returned == null) return null;
        if (!(returned instanceof String s)) {
            throw new CellDiff.ReturnShapeException(
                    "expected a doc string (string), got " + returned.getClass().getSimpleName());
        }
        if (s.equals(content)) return null;
        return new DocStringDiff(span, content, s);
    }

    /** Thrown by the executor when a doc-string step's returned string differs. */
    public static final class DocStringMismatchException extends RuntimeException {
        private final DocStringDiff diff;

        public DocStringMismatchException(DocStringDiff diff) {
            super(message(diff));
            this.diff = diff;
        }

        public DocStringDiff diff() {
            return diff;
        }

        private static String message(DocStringDiff diff) {
            return "doc string: expected " + quote(diff.expected()) + " but was " + quote(diff.actual());
        }

        // Mirrors JSON.stringify's quoting of the TS error message text closely enough for a
        // human-readable exception message (this string is never parsed back).
        private static String quote(String s) {
            return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
        }
    }

    /** Type-guard helper mirroring {@code isDocStringMismatchError} in {@code doc-string-diff.ts}. */
    public static boolean isDocStringMismatchException(Throwable e) {
        return e instanceof DocStringMismatchException;
    }
}
