package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.Ast.Block;
import com.oselvar.var.core.Ast.Blockquote;
import com.oselvar.var.core.Ast.Fence;
import com.oselvar.var.core.Ast.Heading;
import com.oselvar.var.core.Ast.InlineOffset;
import com.oselvar.var.core.Ast.ListItem;
import com.oselvar.var.core.Ast.Paragraph;
import com.oselvar.var.core.Ast.Table;
import com.oselvar.var.core.Ast.ThematicBreak;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Port of {@code typescript/packages/var-core/tests/scanner.test.ts}, cross-checked against
 * {@code python/packages/var-core/tests/test_scanner.py}.
 *
 * <p>The two TS cases that assert on {@code cellSpans} via {@code parse(...)} (table-cell source
 * spans) are translated against {@link Scanner#scan} directly instead: {@code Parse.java} does not
 * exist yet in this port (a later task), and {@code parse.ts} is a thin {@code structure(path,
 * source, scan(source, plugins))} wrapper that does not alter table content or spans — so calling
 * {@code scan} directly and finding the {@code table} block among the returned blocks is behavior-
 * equivalent for these assertions.
 */
class ScannerTest {

    // ── Heading tests ────────────────────────────────────────────────────

    @Test
    void scanFindsASingleH1Heading() {
        List<Block> blocks = Scanner.scan("# Hello");
        assertEquals(1, blocks.size());
        Heading h = assertInstanceOf(Heading.class, blocks.get(0));
        assertEquals(1, h.level());
        assertEquals("Hello", h.text());
        assertEquals(new Span(0, 7, 1, 1, 1, 8), h.span());
    }

    @Test
    void scanFindsHeadingsAtLevels1Through6() {
        String source = "# a\n## b\n### c\n#### d\n##### e\n###### f";
        List<Block> blocks = Scanner.scan(source);
        List<Integer> levels =
                blocks.stream()
                        .filter(Heading.class::isInstance)
                        .map(b -> ((Heading) b).level())
                        .collect(Collectors.toList());
        assertEquals(List.of(1, 2, 3, 4, 5, 6), levels);
    }

    @Test
    void scanIgnoresHeadingsWithMoreThan6Hashes() {
        List<Block> blocks = Scanner.scan("####### too deep");
        assertFalse(blocks.stream().anyMatch(Heading.class::isInstance));
    }

    @Test
    void scanStripsTheOptionalTrailingHashMarker() {
        List<Block> blocks = Scanner.scan("## Hello ##");
        Heading h = assertInstanceOf(Heading.class, blocks.get(0));
        assertEquals("Hello", h.text());
    }

    // ── Paragraph tests ──────────────────────────────────────────────────

    @Test
    void scanGroupsConsecutiveNonBlankLinesIntoASingleParagraph() {
        String source = "first line\nsecond line\n\nthird line";
        List<Block> blocks = Scanner.scan(source);
        List<Paragraph> paragraphs =
                blocks.stream()
                        .filter(Paragraph.class::isInstance)
                        .map(Paragraph.class::cast)
                        .collect(Collectors.toList());
        assertEquals(2, paragraphs.size());
        assertEquals("first line\nsecond line", paragraphs.get(0).text());
        assertEquals("third line", paragraphs.get(1).text());
    }

    @Test
    void paragraphSpanCoversTheFullMultiLineRange() {
        String source = "first line\nsecond line\n\nthird line";
        List<Block> blocks = Scanner.scan(source);
        Paragraph p1 =
                blocks.stream()
                        .filter(Paragraph.class::isInstance)
                        .map(Paragraph.class::cast)
                        .findFirst()
                        .orElseThrow();
        assertEquals(0, p1.span().startOffset());
        assertEquals("first line\nsecond line".length(), p1.span().endOffset());
        assertEquals(1, p1.span().startLine());
        assertEquals(2, p1.span().endLine());
    }

    @Test
    void paragraphInlineMapMapsTextOffsetsToSourceOffsets() {
        String source = "# Heading\n\nhello world";
        List<Block> blocks = Scanner.scan(source);
        Paragraph paragraph =
                blocks.stream()
                        .filter(Paragraph.class::isInstance)
                        .map(Paragraph.class::cast)
                        .findFirst()
                        .orElseThrow();
        // 'hello world' lives at source offset 11 (after '# Heading\n\n')
        assertEquals(new InlineOffset(0, 11), paragraph.inlineMap().get(0));
    }

    /**
     * U+1F389 PARTY POPPER is a surrogate pair (2 UTF-16 code units). Source "🎉 hello" is 8
     * UTF-16 units total (2 + space + "hello"[5] = 2+1+5=8). The paragraph's span end_offset must
     * be 8, not 7 (a code-point count would be wrong here) — proving the scanner-level span
     * computation holds at the astral boundary, not just Span/Inline/TableCells in isolation.
     */
    @Test
    void astralParagraphSpanEndOffsetIsUtf16CodeUnits() {
        String source = "🎉 hello"; // 🎉 hello
        assertEquals(8, source.length());
        List<Block> blocks = Scanner.scan(source);
        assertEquals(1, blocks.size());
        Paragraph p = assertInstanceOf(Paragraph.class, blocks.get(0));
        assertEquals(0, p.span().startOffset());
        assertEquals(8, p.span().endOffset());
    }

    // ── Fence tests ──────────────────────────────────────────────────────

    @Test
    void scanRecognizesAFencedCodeBlockWithInfoString() {
        String source = "# Title\n\n```json\n{ \"a\": 1 }\n```\n";
        List<Block> blocks = Scanner.scan(source);
        Fence fence =
                blocks.stream()
                        .filter(Fence.class::isInstance)
                        .map(Fence.class::cast)
                        .findFirst()
                        .orElseThrow();
        assertEquals("json", fence.info());
        assertEquals("{ \"a\": 1 }\n", fence.body());
    }

    @Test
    void scanToleratesAFenceWithNoInfoString() {
        List<Block> blocks = Scanner.scan("```\nplain body\n```");
        Fence fence =
                blocks.stream()
                        .filter(Fence.class::isInstance)
                        .map(Fence.class::cast)
                        .findFirst()
                        .orElseThrow();
        assertEquals("", fence.info());
        assertEquals("plain body\n", fence.body());
    }

    @Test
    void scanDoesNotSplitParagraphsAcrossAFence() {
        String source = "paragraph above\n\n```\nbody\n```\n\nparagraph below";
        List<Block> blocks = Scanner.scan(source);
        List<String> kinds = blocks.stream().map(ScannerTest::kindOf).collect(Collectors.toList());
        assertEquals(List.of("paragraph", "fence", "paragraph"), kinds);
    }

    // ── Table tests ───────────────────────────────────────────────────────

    @Test
    void scanRecognizesAGfmTableWithHeaderDelimiterRows() {
        String source = "| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |\n";
        List<Block> blocks = Scanner.scan(source);
        Table table =
                blocks.stream()
                        .filter(Table.class::isInstance)
                        .map(Table.class::cast)
                        .findFirst()
                        .orElseThrow();
        assertEquals(List.of("name", "age"), table.header().cells());
        assertEquals(2, table.rows().size());
        assertEquals(List.of("Bob", "30"), table.rows().get(0).cells());
        assertEquals(List.of("Eve", "25"), table.rows().get(1).cells());
    }

    @Test
    void aLineThatLooksLikeARowButHasNoFollowingDelimiterIsAParagraph() {
        List<Block> blocks = Scanner.scan("| not | a | table |");
        assertInstanceOf(Paragraph.class, blocks.get(0));
    }

    @Test
    void tableRowsExposeASourceSpanPerCellThatSlicesBackToTheTrimmedCellText() {
        String source =
                """
                # T

                these rows:

                | a | bb  |
                | - | --- |
                | 1 | 222 |""";
        List<Block> blocks = Scanner.scan(source);
        Table table =
                blocks.stream()
                        .filter(Table.class::isInstance)
                        .map(Table.class::cast)
                        .findFirst()
                        .orElseThrow();
        Ast.Row row = table.rows().get(0);
        assertEquals(2, row.cellSpans().size());
        assertEquals("1", slice(source, row.cellSpans().get(0)));
        assertEquals("222", slice(source, row.cellSpans().get(1)));
        // The header row carries cell spans too.
        assertEquals("bb", slice(source, table.header().cellSpans().get(1)));
    }

    @Test
    void aSingleColumnGfmTableParsesAsATableNotParagraphs() {
        String source =
                """
                # T

                these:

                | n |
                | - |
                | 7 |
                | 8 |""";
        List<Block> blocks = Scanner.scan(source);
        Table table =
                blocks.stream()
                        .filter(Table.class::isInstance)
                        .map(Table.class::cast)
                        .findFirst()
                        .orElseThrow();
        assertEquals(List.of("n"), table.header().cells());
        assertEquals(
                List.of(List.of("7"), List.of("8")),
                table.rows().stream().map(Ast.Row::cells).collect(Collectors.toList()));
        Span c = table.rows().get(0).cellSpans().get(0);
        assertEquals("7", slice(source, c));
    }

    // ── Thematic break tests ─────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {"---", "***", "___", "----", "* * *"})
    void recognizesThematicBreak(String mark) {
        List<Block> blocks = Scanner.scan("a\n\n" + mark + "\n\nb");
        List<String> kinds = blocks.stream().map(ScannerTest::kindOf).collect(Collectors.toList());
        assertEquals(List.of("paragraph", "thematic_break", "paragraph"), kinds);
    }

    // ── List item tests ──────────────────────────────────────────────────

    @Test
    void scanRecognizesUnorderedListItems() {
        List<Block> blocks =
                Scanner.scan("- Given I have 100\n- When I withdraw 40\n- Then I should have 60");
        List<String> kinds = blocks.stream().map(ScannerTest::kindOf).collect(Collectors.toList());
        assertEquals(List.of("list_item", "list_item", "list_item"), kinds);
        ListItem first = assertInstanceOf(ListItem.class, blocks.get(0));
        assertFalse(first.ordered());
        assertEquals("Given I have 100", first.text());
    }

    @Test
    void scanRecognizesOrderedListItems() {
        List<Block> blocks = Scanner.scan("1. First step\n2. Second step");
        List<String> kinds = blocks.stream().map(ScannerTest::kindOf).collect(Collectors.toList());
        assertEquals(List.of("list_item", "list_item"), kinds);
        ListItem first = assertInstanceOf(ListItem.class, blocks.get(0));
        assertTrue(first.ordered());
    }

    // ── Blockquote tests ─────────────────────────────────────────────────

    @Test
    void scanRecognizesBlockquotes() {
        List<Block> blocks = Scanner.scan("> Given I have 100\n> When I withdraw 40");
        assertEquals(1, blocks.size());
        Blockquote bq = assertInstanceOf(Blockquote.class, blocks.get(0));
        assertEquals("Given I have 100\nWhen I withdraw 40", bq.text());
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private static String kindOf(Block b) {
        return switch (b) {
            case Heading h -> "heading";
            case Paragraph p -> "paragraph";
            case ListItem l -> "list_item";
            case Blockquote bq -> "blockquote";
            case Table t -> "table";
            case Fence f -> "fence";
            case ThematicBreak t -> "thematic_break";
        };
    }

    private static String slice(String source, Span span) {
        return source.substring(span.startOffset(), span.endOffset());
    }
}
