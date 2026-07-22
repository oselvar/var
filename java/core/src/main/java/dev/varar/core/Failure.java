package dev.varar.core;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Converts a caught step exception into the structured {@link Result.ExampleFailure} payload —
 * port of {@code var-core/src/failure.ts}. Shared by every producer so failures are
 * byte-identical. Called only on the failure path, so it always returns a payload.
 *
 * <p><b>Stack-frame adaptation for Java:</b> TS's {@code error.stack} is a mutable, freely
 * splice-able string; {@code execute.ts}'s {@code augmentStack} injects a synthetic {@code
 * "    at <label> (<specPath>:<line>:<col>)"} text line into it, which {@code failingLine} then
 * regex-extracts. Java's {@link Throwable} has no equivalent freeform-text stack — its {@code
 * StackTraceElement[]} is a structured type — so the Java-native equivalent (for a later
 * executor task to produce, mirroring {@code augmentStack}) is a synthetic {@link
 * StackTraceElement} whose {@code fileName}/{@code lineNumber} are the spec path/line, prepended
 * to the exception's stack trace via {@code Throwable.setStackTrace}. This class reads the
 * printed stack trace text ({@link #stackTraceText}) the same way {@code failing_line} in the
 * Python port reads {@code error.stack} — i.e. it doesn't care how the frame got there, only that
 * a rendered {@code "<specPath>:<line>)"} substring is present. (Java's rendered frames have no
 * column, unlike V8's, hence the regex here has no trailing {@code :\d+} for a column.)
 */
public final class Failure {

    private Failure() {}

    /**
     * A thrown step error → the {@code ExampleResult.failure} payload.
     *
     * @param error the caught step exception.
     * @param specPath the spec's path, as it would appear in an injected stack frame.
     * @param fallbackLine used when no frame matching {@code specPath} is found in the stack.
     */
    public static Result.ExampleFailure toFailure(Throwable error, String specPath, int fallbackLine) {
        String stack = stackTraceText(error);
        String message = error.getMessage() != null ? error.getMessage() : String.valueOf(error);

        List<Result.CellFailure> cells = null;
        if (CellDiff.isCellMismatchException(error)) {
            List<Result.CellFailure> failing = new ArrayList<>();
            for (CellDiff c : ((CellDiff.CellMismatchException) error).cells()) {
                if (!c.ok()) {
                    failing.add(new Result.CellFailure(
                            c.span().startOffset(), c.span().endOffset(), c.actual()));
                }
            }
            if (!failing.isEmpty()) cells = List.copyOf(failing);
        }

        Integer line = failingLine(stack, specPath);
        return new Result.ExampleFailure(line != null ? line : fallbackLine, message, stack, cells);
    }

    /** Recovers the 1-based failing line from an injected {@code "<specPath>:<line>)"} frame. */
    private static Integer failingLine(String stack, String specPath) {
        Pattern pattern = Pattern.compile(Pattern.quote(specPath) + ":(\\d+)\\)");
        Matcher m = pattern.matcher(stack);
        return m.find() ? Integer.valueOf(m.group(1)) : null;
    }

    private static String stackTraceText(Throwable error) {
        StringWriter sw = new StringWriter();
        error.printStackTrace(new PrintWriter(sw));
        return sw.toString();
    }
}
