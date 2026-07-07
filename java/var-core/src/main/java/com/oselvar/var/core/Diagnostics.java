package com.oselvar.var.core;

/**
 * Diagnostics — port of the subset of {@code var-core/src/diagnostics.ts} that {@link Plan}
 * actually needs.
 *
 * <p>Scoped deliberately narrow: {@code diagnostics.ts}'s {@code Diagnostic} type also carries a
 * human-readable {@code message} (used by editor tooling), but neither {@code plan.ts}'s own
 * logic nor its conformance projection ({@code toPlanArtifact}, confirmed against every bundle's
 * {@code golden/plan.json} — e.g. {@code conformance/bundles/05-ambiguous-match/golden/plan.json},
 * whose {@code diagnostics[]} entries carry only {@code code}/{@code severity}/{@code span}) reads
 * it back. Porting the message text (and the {@code Candidate}/{@code AmbiguousInput} plumbing
 * that feeds it) is out of scope here — a later task can add it if/when a Java consumer needs
 * rendered diagnostic text.
 *
 * <p>{@link Severity} mirrors {@code diagnostics.ts}'s {@code Severity} plus an {@code INFO} level
 * that TS doesn't currently define — included per this port's task brief so the enum doesn't need
 * a source-incompatible change the first time an {@code info}-level diagnostic is added.
 */
public final class Diagnostics {

    private Diagnostics() {}

    /** Diagnostic severity. TS only ever constructs {@code ERROR} today; {@code INFO} is unused. */
    public enum Severity {
        ERROR,
        WARNING,
        INFO
    }

    /**
     * The closed set of diagnostic codes {@code plan.ts} actually produces (mirrors TS's {@code
     * DiagnosticCode} string-literal union: {@code 'ambiguous-match' | 'error-fence-without-step'}).
     */
    public enum DiagnosticCode {
        AMBIGUOUS_MATCH,
        ERROR_FENCE_WITHOUT_STEP,
        DRIFT
    }

    /** One diagnostic: its code, severity, and the source span it points at. */
    public record Diagnostic(DiagnosticCode code, Severity severity, Span span) {}

    /**
     * Mirrors {@code ambiguousMatch} in diagnostics.ts (message text dropped — see class javadoc).
     * {@code span} points at the ambiguous match region.
     */
    public static Diagnostic ambiguousMatch(Span span) {
        return new Diagnostic(DiagnosticCode.AMBIGUOUS_MATCH, Severity.ERROR, span);
    }

    /**
     * Mirrors {@code errorFenceWithoutStep} in diagnostics.ts (message text dropped — see class
     * javadoc). {@code span} points at the orphaned {@code ```error} fence.
     */
    public static Diagnostic errorFenceWithoutStep(Span span) {
        return new Diagnostic(DiagnosticCode.ERROR_FENCE_WITHOUT_STEP, Severity.ERROR, span);
    }
}
