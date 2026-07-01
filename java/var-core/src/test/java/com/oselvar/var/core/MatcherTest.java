package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/matcher.test.ts}. */
class MatcherTest {

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    private static Registry reg() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "steps.ts", 1, NOOP_HANDLER, null);
        r = Registry.addStep(r, "I withdraw {int}", "steps.ts", 5, NOOP_HANDLER, null);
        return r;
    }

    @Test
    void findHitsReturnsNoHitsWhenNothingMatches() {
        assertEquals(List.of(), Matcher.findHits("hello world", reg()));
    }

    @Test
    void findHitsReturnsOneHitPerStepExpressionThatMatches() {
        List<Matcher.Hit> hits = Matcher.findHits("Given I have 5 cukes in my belly", reg());
        assertEquals(1, hits.size());
        assertEquals("I have {int} cukes", hits.get(0).expression());
        assertEquals(6, hits.get(0).matchStart());
        assertEquals(20, hits.get(0).matchEnd());
        assertEquals(List.of(5), hits.get(0).args());
    }

    @Test
    void findHitsReturnsMultipleHitsWhenMultipleExpressionsMatchNonOverlappingRanges() {
        List<Matcher.Hit> hits = Matcher.findHits("I have 5 cukes and I withdraw 3", reg());
        assertEquals(
                List.of("I have {int} cukes", "I withdraw {int}"),
                hits.stream().map(Matcher.Hit::expression).toList());
    }

    @Test
    void resolveHitsPicksLongestLeftmostWhenRangesOverlap() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "s.ts", 1, NOOP_HANDLER, null);
        r = Registry.addStep(r, "I have {int} cukes in my belly", "s.ts", 2, NOOP_HANDLER, null);
        List<Matcher.Hit> hits = Matcher.findHits("I have 5 cukes in my belly", r);
        Matcher.ResolvedSteps result = Matcher.resolveHits(hits);

        Matcher.Ok ok = assertInstanceOf(Matcher.Ok.class, result);
        assertEquals(1, ok.steps().size());
        assertEquals("I have {int} cukes in my belly", ok.steps().get(0).expression());
    }

    @Test
    void resolveHitsReturnsAmbiguousWhenSameStartAndSameLengthMatch() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "s.ts", 1, NOOP_HANDLER, null);
        r = Registry.addStep(r, "I have {int} {word}", "s.ts", 2, NOOP_HANDLER, null);
        List<Matcher.Hit> hits = Matcher.findHits("I have 5 cukes", r);
        Matcher.ResolvedSteps result = Matcher.resolveHits(hits);

        Matcher.Ambiguous ambiguous = assertInstanceOf(Matcher.Ambiguous.class, result);
        assertEquals(1, ambiguous.collisions().size());
        assertEquals(2, ambiguous.collisions().get(0).candidates().size());
    }

    @Test
    void resolveHitsReturnsAllNonOverlappingHitsLeftToRight() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "s.ts", 1, NOOP_HANDLER, null);
        r = Registry.addStep(r, "I withdraw {int}", "s.ts", 2, NOOP_HANDLER, null);
        List<Matcher.Hit> hits = Matcher.findHits("Given I have 5 cukes and I withdraw 3", r);
        Matcher.ResolvedSteps result = Matcher.resolveHits(hits);

        Matcher.Ok ok = assertInstanceOf(Matcher.Ok.class, result);
        assertEquals(
                List.of("I have {int} cukes", "I withdraw {int}"),
                ok.steps().stream().map(Matcher.Hit::expression).toList());
    }

    /**
     * Empirical UTF-16-offset verification (see {@code Matcher}'s class Javadoc and Task 14's
     * brief): places an astral character (an emoji outside the BMP — a surrogate pair, 2 {@code
     * char}s but 1 Unicode code point) before a captured {@code {string}} parameter, then checks
     * {@code matchStart}/{@code paramSpans} against offsets computed purely with {@code
     * String#indexOf}/{@code String#length} (which are UTF-16-code-unit-native in Java). If {@code
     * cucumber-expressions}'s {@code Group.getStart()/getEnd()} reported Unicode code-point offsets
     * instead (as raw {@code re}/{@code cucumber-expressions} do in the Python port, forcing {@code
     * to_utf16_offset}), every assertion below involving an offset *after* the emoji would be off
     * by exactly one and this test would fail.
     */
    @Test
    void paramSpansUseUtf16OffsetsAcrossAnAstralCharacterNoManualConversionNeeded() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I like {string}", "s.ts", 1, NOOP_HANDLER, null);

        String sentence = "😀 I like \"tea\""; // 😀 then " I like \"tea\""

        // Sanity check: this string really does contain an astral character, i.e. its
        // UTF-16 char count and Unicode code-point count differ — otherwise this test
        // would prove nothing.
        assertTrue(Character.isHighSurrogate(sentence.charAt(0)));
        assertEquals(sentence.length() - 1, sentence.codePointCount(0, sentence.length()));

        List<Matcher.Hit> hits = Matcher.findHits(sentence, r);
        assertEquals(1, hits.size());
        Matcher.Hit hit = hits.get(0);

        int expectedMatchStart = sentence.indexOf("I like");
        assertEquals(expectedMatchStart, hit.matchStart());
        assertEquals(sentence.length(), hit.matchEnd());

        assertEquals(1, hit.paramSpans().size());
        Matcher.ParamSpan span = hit.paramSpans().get(0);
        // cucumber-expressions' {string} capture group spans the whole quoted token
        // (quotes included) — the outer wrapping group compiled per-parameter, as
        // confirmed by the offsets below. The dequoted value ("tea", asserted via
        // hit.args() below) comes from a separate, inner group used only for
        // ParameterType#transform, not for this span.
        int quoteOpen = sentence.indexOf('"');
        int expectedParamStart = quoteOpen;
        int expectedParamEnd = sentence.length();
        assertEquals(expectedParamStart, span.start());
        assertEquals(expectedParamEnd, span.end());
        assertEquals("\"tea\"", sentence.substring(span.start(), span.end()));
        assertEquals(List.of("tea"), hit.args());
    }
}
