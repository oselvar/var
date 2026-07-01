package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/doc-string-diff.test.ts}. */
class DocStringDiffTest {

    private static final Span SPAN = new Span(0, 6, 1, 1, 1, 6);

    @Test
    void compareDocStringEqualContentReturnsNull() {
        assertNull(DocStringDiff.compareDocString("hello\n", "hello\n", SPAN));
    }

    @Test
    void compareDocStringNullReturnReturnsNullAssertedNothing() {
        assertNull(DocStringDiff.compareDocString(null, "hello\n", SPAN));
    }

    @Test
    void compareDocStringDifferentContentReturnsDiffWithSpanExpectedActual() {
        assertEquals(
                new DocStringDiff(SPAN, "hello\n", "bye\n"),
                DocStringDiff.compareDocString("bye\n", "hello\n", SPAN));
    }

    @Test
    void compareDocStringANonStringReturnThrowsReturnShapeException() {
        assertThrows(
                CellDiff.ReturnShapeException.class, () -> DocStringDiff.compareDocString(42, "hello\n", SPAN));
    }

    @Test
    void docStringMismatchExceptionCarriesTheDiffAndIsDetectable() {
        DocStringDiff.DocStringMismatchException err =
                new DocStringDiff.DocStringMismatchException(new DocStringDiff(SPAN, "hello\n", "bye\n"));
        assertTrue(DocStringDiff.isDocStringMismatchException(err));
        assertFalse(DocStringDiff.isDocStringMismatchException(new RuntimeException("x")));
        assertEquals("bye\n", err.diff().actual());
    }
}
