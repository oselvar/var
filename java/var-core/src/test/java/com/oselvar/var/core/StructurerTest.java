package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.Ast.Example;
import com.oselvar.var.core.Ast.VarDoc;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Port of {@code typescript/packages/var-core/tests/structurer.test.ts}, cross-checked against
 * {@code python/packages/var-core/tests/test_structurer.py}.
 */
class StructurerTest {

    @Test
    void everyParagraphBecomesACandidateExampleScopedByTheHeadingsAboveIt() {
        String source =
                "# Withdrawing cash\n\nGiven I have $100 in my account\n\n# Overdraft\n\nGiven I have $10 in my account";
        VarDoc varDoc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, varDoc.examples().size());
        assertEquals(List.of("Withdrawing cash"), varDoc.examples().get(0).scopeStack());
        assertEquals(List.of("Overdraft"), varDoc.examples().get(1).scopeStack());
    }

    @Test
    void twoParagraphsUnderTheSameHeadingEachBecomeASeparateExample() {
        String source = "## Example\n\nFirst paragraph.\n\nSecond paragraph.";
        VarDoc varDoc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, varDoc.examples().size());
        assertTrue(varDoc.examples().get(0).body().get(0) instanceof Ast.Paragraph);
        assertTrue(varDoc.examples().get(1).body().get(0) instanceof Ast.Paragraph);
        assertEquals(List.of("Example"), varDoc.examples().get(0).scopeStack());
        assertEquals(List.of("Example"), varDoc.examples().get(1).scopeStack());
    }

    @Test
    void nestedHeadingsStackIntoAnOuterToInnerScopeStack() {
        String source = "## Outer\n\nbody one\n\n### Inner\n\nbody two";
        VarDoc varDoc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, varDoc.examples().size());
        assertEquals(List.of("Outer"), varDoc.examples().get(0).scopeStack());
        assertEquals(List.of("Outer", "Inner"), varDoc.examples().get(1).scopeStack());
    }

    @Test
    void aHeadingAtTheSameLevelPopsThePreviousSiblingOffTheScopeStack() {
        String source = "## A\n\nbody A\n\n## B\n\nbody B";
        VarDoc varDoc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, varDoc.examples().size());
        assertEquals(List.of("A"), varDoc.examples().get(0).scopeStack());
        assertEquals(List.of("B"), varDoc.examples().get(1).scopeStack());
    }

    @Test
    void aParagraphWithNoEnclosingHeadingHasAnEmptyScopeStack() {
        String source = "standalone paragraph";
        VarDoc varDoc = Structurer.structure("p.md", source, Scanner.scan(source));
        assertEquals(1, varDoc.examples().size());
        assertEquals(List.of(), varDoc.examples().get(0).scopeStack());
    }

    @Test
    void headingsOnTheirOwnProduceNoExamples() {
        String source = "# Title only\n\n## Sub-title\n\n### Another";
        VarDoc varDoc = Structurer.structure("h.md", source, Scanner.scan(source));
        assertEquals(0, varDoc.examples().size());
    }

    @Test
    void structurePreservesTheSourceStringVerbatim() {
        String source = "# Hi\n\nbody";
        VarDoc varDoc = Structurer.structure("p.md", source, Scanner.scan(source));
        assertEquals(source, varDoc.source());
        assertEquals("p.md", varDoc.path());
    }

    @Test
    void orphanTablesAndFencesAreRecordedOnTheVarDoc() {
        String source = "| name | age |\n|------|-----|\n| Bob  | 30  |";
        VarDoc varDoc = Structurer.structure("o.md", source, Scanner.scan(source));
        assertEquals(1, varDoc.orphanAttachments().size());
        assertTrue(varDoc.orphanAttachments().get(0) instanceof Ast.Table);
    }

    @Test
    void aTableRightAfterAParagraphAttachesToThatParagraphNotOrphan() {
        String source =
                "## Example\n\nGiven these users:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |";
        VarDoc varDoc = Structurer.structure("o.md", source, Scanner.scan(source));
        assertEquals(0, varDoc.orphanAttachments().size());
        Example example = varDoc.examples().get(0);
        assertTrue(example.body().stream().anyMatch(b -> b instanceof Ast.Table));
    }

    @Test
    void aHeadingBetweenAParagraphAndAFenceMakesTheFenceAnOrphan() {
        String source = "## A\n\npara\n\n## B\n\n```\nfenced body\n```\n";
        VarDoc varDoc = Structurer.structure("h.md", source, Scanner.scan(source));
        assertEquals(1, varDoc.orphanAttachments().size());
        Example example = varDoc.examples().get(0);
        assertFalse(example.body().stream().anyMatch(b -> b instanceof Ast.Fence));
    }
}
