package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;

/**
 * Light coverage of {@link Diagnostics}'s two constructor helpers — this module is a thin
 * supporting piece for {@link Plan}, which is where the bulk of the behavior (and tests) lives.
 */
class DiagnosticsTest {

    private static final Span SPAN = new Span(0, 5, 1, 1, 1, 6);

    @Test
    void ambiguousMatchBuildsAnErrorSeverityDiagnosticWithTheGivenSpan() {
        Diagnostics.Diagnostic d = Diagnostics.ambiguousMatch(SPAN);
        assertEquals(Diagnostics.DiagnosticCode.AMBIGUOUS_MATCH, d.code());
        assertEquals(Diagnostics.Severity.ERROR, d.severity());
        assertSame(SPAN, d.span());
    }

    @Test
    void errorFenceWithoutStepBuildsAnErrorSeverityDiagnosticWithTheGivenSpan() {
        Diagnostics.Diagnostic d = Diagnostics.errorFenceWithoutStep(SPAN);
        assertEquals(Diagnostics.DiagnosticCode.ERROR_FENCE_WITHOUT_STEP, d.code());
        assertEquals(Diagnostics.Severity.ERROR, d.severity());
        assertSame(SPAN, d.span());
    }
}
