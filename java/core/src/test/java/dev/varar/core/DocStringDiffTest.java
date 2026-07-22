package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

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
    void compareDocStringDifferentContentReturnsACellLabelledDocString() {
        // A doc string is one cell, compared whole. expected/actual are quoted so a
        // whitespace-only difference stays visible.
        CellDiff diff = DocStringDiff.compareDocString("bye\n", "hello\n", SPAN);
        assertEquals(DocStringDiff.DOC_STRING_COLUMN, diff.column());
        assertEquals(SPAN, diff.span());
        assertEquals("\"hello\\n\"", diff.expected());
        assertEquals("\"bye\\n\"", diff.actual());
        assertFalse(diff.ok());
    }

    @Test
    void aDocStringCellReadsLikeAnyOtherCellMismatch() {
        CellDiff diff = DocStringDiff.compareDocString("bye\n", "hello\n", SPAN);
        assertEquals(
                "doc string: expected \"hello\\n\" but was \"bye\\n\"",
                new CellDiff.CellMismatchException(java.util.List.of(diff)).getMessage());
    }

    @Test
    void compareDocStringANonStringReturnThrowsReturnShapeException() {
        assertThrows(CellDiff.ReturnShapeException.class, () -> DocStringDiff.compareDocString(42, "hello\n", SPAN));
    }
}
