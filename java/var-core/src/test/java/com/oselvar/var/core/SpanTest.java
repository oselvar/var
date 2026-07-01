package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Port of typescript/packages/var-core/tests/span.test.ts. */
class SpanTest {

    @Test
    void spanFromOffsetsComputesLineAndColumnForASingleLineSource() {
        String source = "hello world";
        Span span = Span.spanFromOffsets(source, 6, 11);
        assertEquals(new Span(6, 11, 1, 7, 1, 12), span);
    }

    @Test
    void spanFromOffsetsHandlesMultiLineSources() {
        String source = "line one\nline two\nline three";
        // 'two' starts at offset 14, ends at 17
        Span span = Span.spanFromOffsets(source, 14, 17);
        assertEquals(new Span(14, 17, 2, 6, 2, 9), span);
    }

    @Test
    void spanFromOffsetsHandlesARangeCrossingANewline() {
        String source = "ab\ncd";
        // From offset 1 ('b') to 4 ('d')
        Span span = Span.spanFromOffsets(source, 1, 4);
        assertEquals(new Span(1, 4, 1, 2, 2, 2), span);
    }

    @Test
    void spanFromOffsetsHandlesAstralCharsNatively() {
        String s = "a😀b"; // 😀 is a surrogate pair: 2 UTF-16 code units
        assertEquals(4, s.length()); // UTF-16 code units, same as JS .length
        Span sp = Span.spanFromOffsets(s, 0, 4);
        assertEquals(0, sp.startOffset());
        assertEquals(4, sp.endOffset());
        assertEquals(1, sp.startLine());
        assertEquals(1, sp.startCol());
        assertEquals(1, sp.endLine());
        assertEquals(5, sp.endCol());
    }
}
