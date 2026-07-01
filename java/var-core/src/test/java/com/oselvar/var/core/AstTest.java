package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Port of typescript/packages/var-core/src/ast.ts (type definitions only, no logic there). */
class AstTest {

    private static final Span SPAN = new Span(0, 5, 1, 1, 1, 6);

    @Test
    void inlineOffsetExposesBothOffsets() {
        Ast.InlineOffset offset = new Ast.InlineOffset(3, 7);
        assertEquals(3, offset.textOffset());
        assertEquals(7, offset.sourceOffset());
    }

    @Test
    void headingExposesLevelTextAndSpanAndIsABlock() {
        Ast.Heading heading = new Ast.Heading(2, "Title", SPAN);
        assertEquals(2, heading.level());
        assertEquals("Title", heading.text());
        assertEquals(SPAN, heading.span());
        assertTrue(heading instanceof Ast.Block);
    }

    @Test
    void paragraphExposesFieldsAndDefensivelyCopiesInlineMap() {
        List<Ast.InlineOffset> mutable = new ArrayList<>();
        mutable.add(new Ast.InlineOffset(0, 0));
        Ast.Paragraph paragraph = new Ast.Paragraph("Some text.", SPAN, mutable);

        assertEquals("Some text.", paragraph.text());
        assertEquals(SPAN, paragraph.span());
        assertEquals(1, paragraph.inlineMap().size());

        // Mutating the caller's list after construction must not affect the record.
        mutable.add(new Ast.InlineOffset(1, 1));
        assertEquals(1, paragraph.inlineMap().size());

        // The record's own list must be unmodifiable.
        assertThrows(UnsupportedOperationException.class, () -> paragraph.inlineMap().add(new Ast.InlineOffset(2, 2)));
        assertTrue(paragraph instanceof Ast.Block);
    }

    @Test
    void listItemExposesFieldsAndDefensivelyCopiesInlineMap() {
        List<Ast.InlineOffset> mutable = new ArrayList<>(List.of(new Ast.InlineOffset(0, 0)));
        Span markerSpan = new Span(0, 2, 1, 1, 1, 3);
        Ast.ListItem listItem = new Ast.ListItem("An item", SPAN, mutable, true, markerSpan);

        assertEquals("An item", listItem.text());
        assertEquals(SPAN, listItem.span());
        assertTrue(listItem.ordered());
        assertEquals(markerSpan, listItem.markerSpan());
        assertThrows(UnsupportedOperationException.class, () -> listItem.inlineMap().add(new Ast.InlineOffset(1, 1)));
        assertTrue(listItem instanceof Ast.Block);
    }

    @Test
    void blockquoteExposesFieldsAndDefensivelyCopiesInlineMap() {
        List<Ast.InlineOffset> mutable = new ArrayList<>(List.of(new Ast.InlineOffset(0, 0)));
        Ast.Blockquote blockquote = new Ast.Blockquote("Quoted", SPAN, mutable);

        assertEquals("Quoted", blockquote.text());
        assertEquals(SPAN, blockquote.span());
        assertThrows(
                UnsupportedOperationException.class, () -> blockquote.inlineMap().add(new Ast.InlineOffset(1, 1)));
        assertTrue(blockquote instanceof Ast.Block);
    }

    @Test
    void rowExposesFieldsAndDefensivelyCopiesCellsAndCellSpans() {
        List<String> cells = new ArrayList<>(List.of("a", "b"));
        List<Span> cellSpans = new ArrayList<>(List.of(SPAN, SPAN));
        Ast.Row row = new Ast.Row(cells, cellSpans, SPAN);

        assertEquals(List.of("a", "b"), row.cells());
        assertEquals(List.of(SPAN, SPAN), row.cellSpans());
        assertEquals(SPAN, row.span());
        assertThrows(UnsupportedOperationException.class, () -> row.cells().add("c"));
        assertThrows(UnsupportedOperationException.class, () -> row.cellSpans().add(SPAN));
    }

    @Test
    void tableExposesFieldsAndDefensivelyCopiesRows() {
        Ast.Row header = new Ast.Row(List.of("h1", "h2"), List.of(SPAN, SPAN), SPAN);
        Ast.Row dataRow = new Ast.Row(List.of("v1", "v2"), List.of(SPAN, SPAN), SPAN);
        List<Ast.Row> rows = new ArrayList<>(List.of(dataRow));
        Ast.Table table = new Ast.Table(SPAN, header, rows);

        assertEquals(SPAN, table.span());
        assertEquals(header, table.header());
        assertEquals(1, table.rows().size());
        assertThrows(UnsupportedOperationException.class, () -> table.rows().add(dataRow));
        assertTrue(table instanceof Ast.Block);
    }

    @Test
    void fenceExposesFields() {
        Span bodySpan = new Span(1, 4, 1, 2, 1, 5);
        Ast.Fence fence = new Ast.Fence(SPAN, "json", "{}", bodySpan);

        assertEquals(SPAN, fence.span());
        assertEquals("json", fence.info());
        assertEquals("{}", fence.body());
        assertEquals(bodySpan, fence.bodySpan());
        assertTrue(fence instanceof Ast.Block);
    }

    @Test
    void thematicBreakExposesSpan() {
        Ast.ThematicBreak thematicBreak = new Ast.ThematicBreak(SPAN);
        assertEquals(SPAN, thematicBreak.span());
        assertTrue(thematicBreak instanceof Ast.Block);
    }

    @Test
    void exampleExposesFieldsAndDefensivelyCopiesScopeStackAndBody() {
        List<String> scopeStack = new ArrayList<>(List.of("Feature", "Scenario"));
        List<Ast.Block> body = new ArrayList<>(List.of(new Ast.ThematicBreak(SPAN)));
        Ast.Example example = new Ast.Example(scopeStack, SPAN, body);

        assertEquals(List.of("Feature", "Scenario"), example.scopeStack());
        assertEquals(SPAN, example.span());
        assertEquals(1, example.body().size());
        assertThrows(UnsupportedOperationException.class, () -> example.scopeStack().add("Nope"));
        assertThrows(UnsupportedOperationException.class, () -> example.body().add(new Ast.ThematicBreak(SPAN)));
    }

    @Test
    void varDocExposesFieldsAndDefensivelyCopiesExamplesAndOrphanAttachments() {
        Ast.Example example = new Ast.Example(List.of(), SPAN, List.of(new Ast.ThematicBreak(SPAN)));
        List<Ast.Example> examples = new ArrayList<>(List.of(example));
        List<Ast.TableOrFence> orphanAttachments = new ArrayList<>(List.of(new Ast.Fence(SPAN, "", "", SPAN)));
        Ast.VarDoc doc = new Ast.VarDoc("spec.md", "# Title", examples, orphanAttachments);

        assertEquals("spec.md", doc.path());
        assertEquals("# Title", doc.source());
        assertEquals(1, doc.examples().size());
        assertEquals(1, doc.orphanAttachments().size());
        assertThrows(UnsupportedOperationException.class, () -> doc.examples().add(example));
        assertThrows(
                UnsupportedOperationException.class,
                () -> doc.orphanAttachments().add(new Ast.Fence(SPAN, "", "", SPAN)));
    }

    @Test
    void blockPermitsExactlySevenVariants() {
        assertEquals(7, Ast.Block.class.getPermittedSubclasses().length);
    }

    @Test
    void tableOrFencePermitsExactlyTableAndFence() {
        Class<?>[] permitted = Ast.TableOrFence.class.getPermittedSubclasses();
        assertEquals(2, permitted.length);
        assertEquals(Set.of(Ast.Table.class, Ast.Fence.class), Set.of(permitted));
    }
}
