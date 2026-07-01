package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.oselvar.var.core.Sentences.Sentence;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Port of {@code var-core/tests/sentences.test.ts}. */
class SentencesTest {

    @Test
    void splitsAParagraphOnPeriodsQuestionMarksExclamationMarks() {
        String text = "First sentence. Second one? Third one!";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("First sentence.", "Second one?", "Third one!"), texts(result));
    }

    @Test
    void keepsOffsetsRelativeToTheInputText() {
        String text = "Alpha. Beta.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(
                List.of(new Sentence("Alpha.", 0, 6), new Sentence("Beta.", 7, 12)), result);
    }

    @Test
    void doesNotSplitInsideNumericLiterals() {
        String text = "The price is $1.50 today.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("The price is $1.50 today."), texts(result));
    }

    @Test
    void doesNotSplitOnCommonAbbreviations() {
        String text = "Use e.g. coffee. It works.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("Use e.g. coffee.", "It works."), texts(result));
    }

    @Test
    void treatsABlankLineAsASentenceBoundary() {
        String text = "First.\n\nSecond.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("First.", "Second."), texts(result));
    }

    @Test
    void treatsABacktickCodeSpanAsASingleToken() {
        String text = "Run `npm test` first. Then `git push`.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("Run `npm test` first.", "Then `git push`."), texts(result));
    }

    @Test
    void theFinalSentenceDoesNotRequireATerminator() {
        String text = "Alpha. Beta";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("Alpha.", "Beta"), texts(result));
    }

    @Test
    void doesNotSplitOnTerminatorsInsideADoubleQuotedString() {
        String text = "Alpha \"with . and ? inside\" beta. Gamma.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("Alpha \"with . and ? inside\" beta.", "Gamma."), texts(result));
    }

    @Test
    void splitsOnASingleNewlineGherkinStyleLinePerStep() {
        String text = "Given I greet \"world\"\nThen the greeting is \"Hello, world!\"";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(
                List.of("Given I greet \"world\"", "Then the greeting is \"Hello, world!\""),
                texts(result));
    }

    @Test
    void splitsBetweenTerminatorsOutsideQuotedStringsIgnoringThoseInside() {
        String text = "Alpha \"with ! inside\". Beta \"and ? inside\"!";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(
                List.of("Alpha \"with ! inside\".", "Beta \"and ? inside\"!"), texts(result));
    }

    /**
     * An astral character (U+1F389, a surrogate pair — 2 UTF-16 code units) inside a sentence
     * must not perturb offset accounting. Java's {@code String}/{@code char} are already UTF-16
     * code-unit indexed (see {@link Span}'s javadoc) — same finding as prior ports — so this needs
     * no conversion layer.
     */
    @Test
    void astralCharacterKeepsOffsetsCorrect() {
        String text = "Party time 🎉! Next one.";
        List<Sentence> result = Sentences.splitSentences(text);
        assertEquals(List.of("Party time 🎉!", "Next one."), texts(result));
        Sentence first = result.get(0);
        assertEquals(0, first.startOffset());
        assertEquals("Party time 🎉!".length(), first.endOffset());
        assertEquals(first.text(), text.substring(first.startOffset(), first.endOffset()));
    }

    @Test
    void resultListIsImmutable() {
        List<Sentence> result = Sentences.splitSentences("Alpha. Beta.");
        assertThrows(UnsupportedOperationException.class, () -> result.add(result.get(0)));
    }

    private static List<String> texts(List<Sentence> sentences) {
        return sentences.stream().map(Sentence::text).toList();
    }
}
