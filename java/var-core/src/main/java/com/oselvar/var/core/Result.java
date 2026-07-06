package com.oselvar.var.core;

import java.util.List;

/**
 * Immutable run-result records — port of {@code var-core/src/result.ts}.
 *
 * <p>{@code SpecResults} is the persisted run result for one spec file: the {@code
 * .var/<spec>.json} file IS a serialized {@code SpecResults}.
 */
public final class Result {

    private Result() {}

    /**
     * A doc-string / cell mismatch as a source-offset range plus the runtime value. {@code from}/
     * {@code to} are absolute source offsets (== CodeMirror positions); {@code to} is exclusive.
     */
    public record CellFailure(int from, int to, String actual) {}

    /**
     * An example's run outcome. Mirrors TS's {@code 'passed' | 'failed'} string-literal union
     * (see {@code Diagnostics.Severity}/{@code DiagnosticCode} for the same enum-for-closed-union
     * convention used elsewhere in this port).
     */
    public enum Status {
        PASSED,
        FAILED
    }

    /**
     * The failure payload carried by a failed {@link ExampleResult}. TS leaves this as an
     * anonymous inline object type on {@code ExampleResult.failure}; Java requires a name here —
     * this follows the Python port's naming ({@code ExampleFailure} in {@code result.py}).
     *
     * @param cells table / header-bound row mismatches; {@code null} when not applicable (TS's
     *     optional {@code cells?}).
     * @param doc a doc-string body mismatch (single span); {@code null} when not applicable (TS's
     *     optional {@code doc?}).
     */
    public record ExampleFailure(int line, String message, String stack, List<CellFailure> cells, CellFailure doc) {
        public ExampleFailure {
            cells = cells == null ? null : List.copyOf(cells);
        }
    }

    /**
     * The run result for one BDD example.
     *
     * @param lines 1-based source lines of this example's steps (the line-wash anchors).
     * @param failure {@code null} when {@code status} is {@code PASSED} (TS's optional {@code
     *     failure?}).
     */
    public record ExampleResult(String name, Status status, List<Integer> lines, ExampleFailure failure) {
        public ExampleResult {
            lines = List.copyOf(lines);
        }
    }

    /** The persisted run result for one spec file. */
    public record SpecResults(int version, String specPath, String sourceHash, List<ExampleResult> examples) {
        public SpecResults {
            examples = List.copyOf(examples);
        }
    }
}
