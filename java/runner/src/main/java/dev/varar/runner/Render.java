package dev.varar.runner;

import dev.varar.core.Failure;
import dev.varar.core.Result;
import java.util.stream.Collectors;

/**
 * Formats a caught step exception into human-readable text — a pure formatter over
 * {@link Failure#toFailure}'s {@link Result.ExampleFailure} payload. {@code var-junit}'s
 * engine work uses {@link #renderFailure} to build the message passed to JUnit
 * Platform's {@code TestExecutionResult.failed(Throwable)}.
 *
 * <p>Deliberately does not re-inspect {@code error}'s type itself: {@link
 * Failure#toFailure} already dispatches cell-mismatch vs. doc-string-mismatch vs.
 * everything else and extracts the failing line; this class only renders whatever it
 * already produced.
 *
 * <p>{@link Result.CellFailure} carries only {@code from}/{@code to} (absolute source
 * offsets) and {@code actual} — no {@code column} and no {@code expected} value is
 * stored there ({@code Failure.toFailure} deliberately drops both at this layer, since
 * the original markdown text at {@code [from, to)} IS the expected value, so it isn't
 * duplicated into the payload). So "expected" is rendered here by slicing {@code
 * source}, and no column name is available to render — a deliberate simplification
 * inherited from {@code Result.CellFailure}'s actual shape, not an oversight.
 */
public final class Render {

    private Render() {}

    /**
     * Renders {@code error} (as caught while running an example planned from {@code
     * source} at {@code path}) into a human-readable failure message.
     *
     * @param error the caught step exception.
     * @param source the spec's full markdown text, used to slice the expected value for
     *     a cell/doc-string mismatch (the payload stores only source offsets).
     * @param path the spec's path, as it would appear in an injected stack frame — passed
     *     through to {@link Failure#toFailure} to resolve the failing line.
     */
    public static String renderFailure(Throwable error, String source, String path) {
        Result.ExampleFailure failure = Failure.toFailure(error, path, 1);

        if (failure.cells() != null) {
            return failure.cells().stream()
                    .map(cell -> renderCellFailure(failure.line(), source, cell))
                    .collect(Collectors.joining("\n"));
        }
        return "line " + failure.line() + ": " + failure.message();
    }

    /** Renders one mismatched cell, slicing {@code source} for the expected value. */
    private static String renderCellFailure(int line, String source, Result.CellFailure cell) {
        String expected = source.substring(cell.from(), cell.to());
        return "line " + line + ": expected \"" + expected + "\", got \"" + cell.actual() + "\"";
    }
}
