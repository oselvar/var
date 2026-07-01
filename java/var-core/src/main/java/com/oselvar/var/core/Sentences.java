package com.oselvar.var.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Splits a block of text into sentence-level spans, so the matcher can try each sentence in a
 * paragraph independently against step definitions.
 *
 * <p>Port of {@code var-core/src/sentences.ts}. Java's {@code String}/{@code char} are already
 * UTF-16 code-unit indexed (see {@link Span}'s javadoc), so — as with the other core modules —
 * this iterates and slices directly on {@code String} offsets, exactly as {@code sentences.ts}
 * does, with no code-point conversion layer.
 */
public final class Sentences {

    private Sentences() {}

    /** A sentence-level span: the trimmed text plus its offsets into the original input. */
    public record Sentence(String text, int startOffset, int endOffset) {}

    private static final Set<String> ABBREVIATIONS = Set.of("e.g.", "i.e.", "etc.", "cf.", "vs.");

    /**
     * Splits {@code text} on {@code .}/{@code !}/{@code ?}/newline terminators, skipping backtick
     * code-span and double-quoted-string interiors, and treating decimal numbers and a fixed
     * abbreviation list ({@code e.g.}, {@code i.e.}, {@code etc.}, {@code cf.}, {@code vs.}) as
     * non-terminating dots.
     */
    public static List<Sentence> splitSentences(String text) {
        List<Sentence> out = new ArrayList<>();
        int segmentStart = 0;
        boolean[] skip = new boolean[text.length()];

        // Mark backtick code spans and double-quoted strings as no-split zones.
        // This keeps terminators like `!` and `?` inside `"Hello, world!"` from
        // breaking up a sentence the matcher needs as a whole `{string}` token.
        for (int j = 0; j < text.length(); j++) {
            char c = text.charAt(j);
            if (c == '`') {
                int close = text.indexOf('`', j + 1);
                if (close == -1) break;
                for (int k = j; k <= close; k++) skip[k] = true;
                j = close;
            } else if (c == '"') {
                int close = text.indexOf('"', j + 1);
                if (close == -1) break;
                for (int k = j; k <= close; k++) skip[k] = true;
                j = close;
            }
        }

        int i = 0;
        while (i < text.length()) {
            if (skip[i]) {
                i++;
                continue;
            }
            char ch = text.charAt(i);
            if (ch == '\n' || ch == '.' || ch == '!' || ch == '?') {
                if (ch == '.' && isInsideNumberOrAbbrev(text, i)) {
                    i++;
                    continue;
                }
                int end = i + 1;
                pushSegment(out, text, segmentStart, end);
                i = end;
                // Skip any following whitespace (spaces + newlines) so the next sentence
                // starts at its first content character.
                while (i < text.length() && (text.charAt(i) == ' ' || text.charAt(i) == '\n')) i++;
                segmentStart = i;
                continue;
            }
            i++;
        }
        pushSegment(out, text, segmentStart, text.length());
        return List.copyOf(out);
    }

    private static void pushSegment(List<Sentence> out, String text, int start, int end) {
        if (end <= start) return;
        String raw = text.substring(start, end);
        String slice = raw.strip();
        if (slice.isEmpty()) return;
        int trimmedStart = start + (raw.length() - raw.stripLeading().length());
        int trimmedEnd = trimmedStart + slice.length();
        out.add(new Sentence(slice, trimmedStart, trimmedEnd));
    }

    private static boolean isInsideNumberOrAbbrev(String text, int dotPos) {
        char prev = dotPos - 1 >= 0 ? text.charAt(dotPos - 1) : '\0';
        char next = dotPos + 1 < text.length() ? text.charAt(dotPos + 1) : '\0';
        if (prev >= '0' && prev <= '9' && next >= '0' && next <= '9') return true;
        // Check known abbreviations ending at dotPos+1
        for (String abbrev : ABBREVIATIONS) {
            int from = Math.max(0, dotPos + 1 - abbrev.length());
            if (text.substring(from, dotPos + 1).equals(abbrev)) return true;
        }
        // Lowercase letter following → likely intra-word
        if (next >= 'a' && next <= 'z') return true;
        return false;
    }
}
