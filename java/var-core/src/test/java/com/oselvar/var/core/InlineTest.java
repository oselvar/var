package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.oselvar.var.core.Ast.InlineOffset;
import com.oselvar.var.core.Inline.InlineResult;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Port of typescript/packages/var-core/tests/inline.test.ts. */
class InlineTest {

    @Test
    void stripsBoldAndItalicMarkersPreservingInnerText() {
        InlineResult result = Inline.stripInline("Given I have **100** in *my* account", 10);
        assertEquals("Given I have 100 in my account", result.text());
        assertEquals(
                10 + "Given I have **".length(),
                findByTextOffset(result.map(), 13).orElseThrow().sourceOffset());
    }

    @Test
    void reducesInlineLinksToTheirTextDroppingTheUrl() {
        InlineResult result = Inline.stripInline("See [the docs](https://example.com).", 0);
        assertEquals("See the docs.", result.text());
    }

    @Test
    void preservesBacktickCodeSpansVerbatimIncludingTheBackticks() {
        InlineResult result = Inline.stripInline("Run `npm test` first.", 0);
        assertEquals("Run `npm test` first.", result.text());
    }

    @Test
    void mapAllowsLiftingTextOffsetsBackToSourceOffsets() {
        InlineResult result = Inline.stripInline("a **bold** word", 100);
        assertEquals("a bold word", result.text());
        // 'bold' starts at text offset 2; in source it is at 100 + 'a **'.length = 104
        assertEquals(104, liftOffset(result.map(), 2));
    }

    @Test
    void midWordUnderscoresArePreservedSnakeCaseIsNotMangled() {
        InlineResult result = Inline.stripInline("the field do_something_now is set", 0);
        assertEquals("the field do_something_now is set", result.text());
    }

    @Test
    void leadingUnderscoreAtAWordBoundaryStillEmphasizes() {
        InlineResult result = Inline.stripInline("Hello _world_ today", 0);
        assertEquals("Hello world today", result.text());
    }

    @Test
    void midWordAsteriskStillStripsCommonMarkAllowsIt() {
        InlineResult result = Inline.stripInline("we *love* code", 0);
        assertEquals("we love code", result.text());
    }

    /**
     * An astral character (a surrogate pair — 2 UTF-16 code units) sits directly next to an
     * emphasis marker. Java's {@code String}/{@code char} are already UTF-16 code-unit indexed
     * (see {@link Span}'s javadoc), so — unlike the Python port, which must maintain a separate
     * UTF-16 cursor alongside its code-point loop — the plain {@code char}-indexed loop in {@link
     * Inline#stripInline} produces correct offsets here with no conversion helper at all.
     */
    @Test
    void astralCharacterAdjacentToAnEmphasisMarkerYieldsCorrectOffsets() {
        String rawText = "Given I have 😀 **100** in *my* account"; // 😀 before **100**
        assertEquals(2, "😀".length()); // sanity: surrogate pair, 2 UTF-16 units
        InlineResult result = Inline.stripInline(rawText, 10);

        assertEquals("Given I have 😀 100 in my account", result.text());
        // '1' of '100' is at text offset 16 (13 chars + 2-unit emoji + 1 space);
        // in source it follows 'Given I have 😀 **' — sourceBase(10) + rawIndex(16) + markerLength(2).
        assertEquals(28, findByTextOffset(result.map(), 16).orElseThrow().sourceOffset());
    }

    /**
     * {@code isWord} must recognize a preceding/following astral letter as a word character by
     * decoding the surrogate pair to its code point ({@link Character#isLetterOrDigit(int)}), not
     * by testing each surrogate half in isolation ({@link Character#isLetterOrDigit(char)} on a
     * lone surrogate is always {@code false}).
     *
     * <p>This is a deliberate, principled divergence from {@code inline.ts}: TypeScript's {@code
     * isWord} runs a {@code \p{L}\p{N}_} regex against a single UTF-16 code unit
     * ({@code rawText[i - 1]}), so for an astral letter it only ever sees one lone surrogate half
     * — which is never a match — and mid-word underscore suppression silently fails to trigger
     * (confirmed empirically against the TS original: stripping the same raw text below produces
     * "DESERET-LETTERab" instead of leaving it untouched). Java correctly resolves the code point
     * across the pair, matching what the Python port already does incidentally (its
     * code-point-indexed strings never split a surrogate pair in the first place).
     */
    @Test
    void isWordRecognizesAnAstralLetterAcrossItsSurrogatePairSoMidWordUnderscoresStayLiteral() {
        String rawText = "𐐀_a_b"; // U+10400 DESERET CAPITAL LETTER LONG A, then "_a_b"
        InlineResult result = Inline.stripInline(rawText, 0);
        assertEquals(rawText, result.text());
    }

    @Test
    void emptyInputYieldsASingleFallbackMapEntry() {
        InlineResult result = Inline.stripInline("", 42);
        assertEquals("", result.text());
        assertEquals(1, result.map().size());
        assertEquals(new InlineOffset(0, 42), result.map().get(0));
    }

    private static Optional<InlineOffset> findByTextOffset(List<InlineOffset> map, int textOffset) {
        return map.stream().filter(m -> m.textOffset() == textOffset).findFirst();
    }

    private static int liftOffset(List<InlineOffset> map, int t) {
        InlineOffset best = map.get(0);
        for (InlineOffset e : map) {
            if (e.textOffset() <= t) best = e;
        }
        return best.sourceOffset() + (t - best.textOffset());
    }
}
