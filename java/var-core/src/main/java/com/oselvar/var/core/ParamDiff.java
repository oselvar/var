package com.oselvar.var.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Parameter comparison — port of {@code var-core/src/param-diff.ts}.
 *
 * <p>Used by the executor to compare a sensor's returned inline actuals against the values
 * captured from the document.
 */
public final class ParamDiff {

    private ParamDiff() {}

    /**
     * Compares {@code returned} against {@code expected} (the captured arguments), producing one
     * {@link CellDiff} per parameter. {@code sourceTexts} is the matched text at each parameter's
     * span (used as the diff's {@code expected} display); {@code paramSpans} anchors each cell to
     * the .md source. {@code expected}, {@code paramSpans}, and {@code sourceTexts} align 1:1 with
     * {@code returned}; the caller validates length first.
     *
     * <p>Structural equality is {@link Objects#equals}: for this codebase's immutable {@code
     * List}/{@code Map}-based values, {@code equals} already compares element-by-element/
     * entry-by-entry recursively — the same semantics as TS's hand-rolled {@code deepEqual}
     * (which exists only because plain JS objects/arrays don't have structural {@code ==}).
     */
    public static List<CellDiff> compareParams(
            List<?> returned, List<?> expected, List<Span> paramSpans, List<String> sourceTexts) {
        List<CellDiff> diffs = new ArrayList<>();
        for (int i = 0; i < expected.size(); i++) {
            boolean ok = Objects.equals(returned.get(i), expected.get(i));
            String expectedText =
                    i < sourceTexts.size() ? sourceTexts.get(i) : String.valueOf(expected.get(i));
            diffs.add(
                    new CellDiff(
                            "arg " + (i + 1),
                            paramSpans.get(i),
                            expectedText,
                            String.valueOf(returned.get(i)),
                            ok));
        }
        return List.copyOf(diffs);
    }
}
