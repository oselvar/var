package dev.varar.core;

/**
 * Where a failure POINTS in the {@code .md}: a mismatch anchors at its first failing span (the
 * cell, the doc string fence body), anything else at the fallback — the step's match start.
 *
 * <p>Port of {@code var-core/src/failure-anchor.ts}. This rule is the single source of truth
 * for failure locations: the executor's stack augmentation renders it per-runtime, and the
 * conformance trace pins it as {@code failure.anchor}, so every language port must reproduce
 * it byte-for-byte.
 */
final class FailureAnchor {
    private FailureAnchor() {}

    static Span anchor(Throwable error, Span fallback) {
        if (CellDiff.isCellMismatchException(error)) {
            for (CellDiff c : ((CellDiff.CellMismatchException) error).cells()) {
                if (!c.ok()) return c.span();
            }
            return fallback;
        }
        return fallback;
    }
}
