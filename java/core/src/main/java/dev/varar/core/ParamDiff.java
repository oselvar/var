package dev.varar.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

/**
 * Parameter comparison — port of {@code var-core/src/param-diff.ts}.
 *
 * <p>Used by the executor to compare a sensor's returned inline actuals against the values
 * captured from the document.
 */
public final class ParamDiff {

    private ParamDiff() {}

    /** One rendered display side plus which branch produced it (drives {@code formatted}). */
    private record Rendered(String text, boolean viaFormat) {}

    /**
     * Renders one side of a parameter diff: the parameter type's {@code format} when it has one
     * (document notation — the only rendering conformance can pin), then the shared
     * string/primitive chain ({@link CellDiff#renderCellValue}). A throwing formatter falls
     * through rather than masking the real mismatch.
     */
    private static Rendered renderParamValue(Object value, Function<Object, String> format) {
        if (format != null) {
            try {
                return new Rendered(format.apply(value), true);
            } catch (RuntimeException e) {
                // fall through to the generic rendering
            }
        }
        return new Rendered(CellDiff.renderCellValue(value), false);
    }

    /** As {@link #compareParams(List, List, List, List, List)} with no display formatters. */
    public static List<CellDiff> compareParams(
            List<?> returned, List<?> expected, List<Span> paramSpans, List<String> sourceTexts) {
        return compareParams(returned, expected, paramSpans, sourceTexts, null);
    }

    /**
     * Compares {@code returned} against {@code expected} (the captured arguments), producing one
     * {@link CellDiff} per parameter. {@code sourceTexts} is the matched text at each parameter's
     * span (used as the diff's {@code expected} display); {@code paramSpans} anchors each cell to
     * the .md source. {@code formats} carries each parameter type's display formatter ({@code
     * null} entries — or a {@code null} list — when a type has none), used only to render the
     * display strings, never for the verdict. {@code expected}, {@code paramSpans}, {@code
     * sourceTexts}, and {@code formats} align 1:1 with {@code returned}; the caller validates
     * length first. Each diff also carries the raw {@code expectedValue}/{@code actualValue} for
     * adapters (see {@link CellDiff}).
     *
     * <p>Structural equality is {@link Objects#equals}: for this codebase's immutable {@code
     * List}/{@code Map}-based values, {@code equals} already compares element-by-element/
     * entry-by-entry recursively — the same semantics as TS's hand-rolled {@code deepEqual}
     * (which exists only because plain JS objects/arrays don't have structural {@code ==}).
     */
    public static List<CellDiff> compareParams(
            List<?> returned,
            List<?> expected,
            List<Span> paramSpans,
            List<String> sourceTexts,
            List<Function<Object, String>> formats) {
        List<CellDiff> diffs = new ArrayList<>();
        for (int i = 0; i < expected.size(); i++) {
            boolean ok = Objects.equals(returned.get(i), expected.get(i));
            Function<Object, String> format = formats != null && i < formats.size() ? formats.get(i) : null;
            String expectedText = i < sourceTexts.size()
                    ? sourceTexts.get(i)
                    : renderParamValue(expected.get(i), format).text();
            Rendered actual = renderParamValue(returned.get(i), format);
            diffs.add(new CellDiff(
                    "cell " + (i + 1),
                    paramSpans.get(i),
                    expectedText,
                    actual.text(),
                    ok,
                    expected.get(i),
                    returned.get(i),
                    actual.viaFormat()));
        }
        return List.copyOf(diffs);
    }
}
