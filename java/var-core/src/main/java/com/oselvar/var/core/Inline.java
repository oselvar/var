package com.oselvar.var.core;

import com.oselvar.var.core.Ast.InlineOffset;
import java.util.ArrayList;
import java.util.List;

/**
 * Strips inline Markdown markup (backtick code spans, {@code [text](url)} links, {@code *}/{@code
 * _} emphasis) from a block's raw text, producing plain text plus a map from offsets in that text
 * back to offsets in the original source.
 *
 * <p>Port of {@code var-core/src/inline.ts}. Java's {@code String}/{@code char} are already
 * UTF-16 code-unit indexed — like JavaScript, and unlike Python (see {@link Span}'s javadoc for
 * the same finding on span computation) — so this iterates by {@code char} exactly as {@code
 * inline.ts} iterates by UTF-16 code unit, with no separate code-point cursor of the kind the
 * Python port ({@code var_core/inline.py}) needs to reconstruct UTF-16 offsets from its
 * code-point-indexed strings.
 */
public final class Inline {

    private Inline() {}

    /** {@code text} is the stripped plain text; {@code map} lifts offsets in it back to source offsets. */
    public record InlineResult(String text, List<InlineOffset> map) {
        public InlineResult {
            map = List.copyOf(map);
        }
    }

    /**
     * Strips inline markup from {@code rawText}, whose first character sits at {@code sourceBase}
     * in the full source document.
     */
    public static InlineResult stripInline(String rawText, int sourceBase) {
        StringBuilder out = new StringBuilder();
        List<InlineOffset> map = new ArrayList<>();
        int textOffset = 0;
        int i = 0;
        int n = rawText.length();

        while (i < n) {
            char ch = rawText.charAt(i);

            if (ch == '`') {
                int close = rawText.indexOf('`', i + 1);
                if (close == -1) {
                    pushOffset(map, textOffset, sourceBase + i);
                    out.append(ch);
                    textOffset++;
                    i++;
                    continue;
                }
                pushOffset(map, textOffset, sourceBase + i);
                String span = rawText.substring(i, close + 1);
                out.append(span);
                textOffset += span.length();
                i = close + 1;
                continue;
            }

            if (ch == '[') {
                int close = findMatching(rawText, i, '[', ']');
                char lparen = close >= 0 && close + 1 < n ? rawText.charAt(close + 1) : '\0';
                if (close > i && lparen == '(') {
                    int closeParen = rawText.indexOf(')', close + 2);
                    if (closeParen > close) {
                        String inner = rawText.substring(i + 1, close);
                        pushOffset(map, textOffset, sourceBase + i + 1);
                        out.append(inner);
                        textOffset += inner.length();
                        i = closeParen + 1;
                        continue;
                    }
                }
            }

            if ((ch == '*' || ch == '_')
                    && (charAtOrDefault(rawText, i + 1) == ch || charAtOrDefault(rawText, i - 1) != ch)) {
                boolean isDouble = charAtOrDefault(rawText, i + 1) == ch;
                int markerLength = isDouble ? 2 : 1;
                // CommonMark: `_` only opens emphasis at a word boundary, so `snake_case`
                // and `foo_bar_baz` stay intact. `*` is allowed mid-word.
                if (ch == '_' && isWord(rawText, i - 1) && isWord(rawText, i + markerLength)) {
                    // mid-word underscore — copy literally (falls through below)
                } else {
                    String marker = isDouble ? String.valueOf(new char[] {ch, ch}) : String.valueOf(ch);
                    int closeAt = rawText.indexOf(marker, i + markerLength);
                    if (closeAt > i + markerLength) {
                        String inner = rawText.substring(i + markerLength, closeAt);
                        pushOffset(map, textOffset, sourceBase + i + markerLength);
                        out.append(inner);
                        textOffset += inner.length();
                        i = closeAt + markerLength;
                        continue;
                    }
                }
            }

            pushOffset(map, textOffset, sourceBase + i);
            out.append(ch);
            textOffset++;
            i++;
        }
        if (map.isEmpty()) {
            map.add(new InlineOffset(0, sourceBase));
        }
        return new InlineResult(out.toString(), map);
    }

    private static void pushOffset(List<InlineOffset> map, int textOffset, int sourceOffset) {
        InlineOffset last = map.isEmpty() ? null : map.get(map.size() - 1);
        if (last == null || last.textOffset() != textOffset) {
            map.add(new InlineOffset(textOffset, sourceOffset));
        }
    }

    /** Returns {@code text.charAt(idx)}, or {@code '\0'} (never a marker char) if out of bounds. */
    private static char charAtOrDefault(String text, int idx) {
        return idx >= 0 && idx < text.length() ? text.charAt(idx) : '\0';
    }

    /**
     * True when {@code text.charAt(idx)} is a Unicode letter, digit, or underscore — mirroring
     * {@code inline.ts}'s {@code \p{L}\p{N}_} regex test.
     *
     * <p>Unlike that regex, which tests a single UTF-16 code unit and so can never recognize an
     * astral (supplementary-plane) letter split across a surrogate pair, this resolves the full
     * code point when {@code idx} lands on either half of a valid surrogate pair, via {@link
     * Character#isLetterOrDigit(int)} on the decoded pair rather than {@link
     * Character#isLetterOrDigit(char)} on one surrogate in isolation. See {@code InlineTest} for
     * the behavioral proof and the TS divergence this intentionally corrects.
     */
    private static boolean isWord(String text, int idx) {
        if (idx < 0 || idx >= text.length()) return false;
        char c = text.charAt(idx);
        if (c == '_') return true;
        int codePoint = c;
        boolean nextIsLow = idx + 1 < text.length() && Character.isLowSurrogate(text.charAt(idx + 1));
        boolean prevIsHigh = idx > 0 && Character.isHighSurrogate(text.charAt(idx - 1));
        boolean pairsForward = Character.isHighSurrogate(c) && nextIsLow;
        boolean pairsBackward = Character.isLowSurrogate(c) && prevIsHigh;
        if (pairsForward) {
            codePoint = Character.toCodePoint(c, text.charAt(idx + 1));
        } else if (pairsBackward) {
            codePoint = Character.toCodePoint(text.charAt(idx - 1), c);
        }
        return Character.isLetterOrDigit(codePoint);
    }

    private static int findMatching(String text, int start, char open, char close) {
        int depth = 0;
        for (int j = start; j < text.length(); j++) {
            char c = text.charAt(j);
            if (c == open) {
                depth++;
            } else if (c == close) {
                depth--;
                if (depth == 0) return j;
            }
        }
        return -1;
    }
}
