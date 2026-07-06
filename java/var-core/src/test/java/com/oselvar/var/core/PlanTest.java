package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/plan.test.ts}. */
class PlanTest {

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    private static Registry reg() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} in my account", "steps.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "I withdraw {int}", "steps.ts", 2, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "I should have {int} left", "steps.ts", 3, NOOP_HANDLER, StepKind.STIMULUS);
        return r;
    }

    @Test
    void planProducesAPlannedExampleWithStepsInDocumentOrder() {
        // The whole paragraph becomes the example name (trailing terminator stripped), even when
        // only parts of it match steps. The heading becomes a `describe` scope.
        String source =
                "# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should" + " have 60 left.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        Plan.ExecutionPlan result = Plan.plan(varDoc, reg());
        assertEquals(0, result.diagnostics().size());
        assertEquals(1, result.examples().size());
        Plan.PlannedExample ex = result.examples().get(0);
        assertEquals("Given I have 100 in my account. When I withdraw 40. Then I should have 60 left", ex.name());
        assertEquals(List.of("Withdrawing"), ex.scopeStack());
        assertEquals(
                List.of("I have 100 in my account", "I withdraw 40", "I should have 60 left"),
                ex.steps().stream().map(Plan.PlannedStep::text).toList());
        assertEquals(List.of(100), ex.steps().get(0).args());
    }

    @Test
    void planEmitsAnAmbiguousMatchDiagnosticAndDoesNotIncludeTheExampleSteps() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "a.ts", 3, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "I have {int} {word}", "a.ts", 8, NOOP_HANDLER, StepKind.STIMULUS);
        Ast.VarDoc varDoc = Parse.parse("e.md", "# Ambig\n\nGiven I have 5 cukes");
        Plan.ExecutionPlan result = Plan.plan(varDoc, r);
        assertEquals(1, result.diagnostics().size());
        assertEquals(
                Diagnostics.DiagnosticCode.AMBIGUOUS_MATCH,
                result.diagnostics().get(0).code());
        assertEquals(0, result.examples().get(0).steps().size());
    }

    @Test
    void planSkipsAnExampleHeadingWhoseBodyHasNoMatchesAndNoKeywordLedSentences() {
        String source = "# Just docs\n\nSome prose with no matches and no keywords.";
        Ast.VarDoc varDoc = Parse.parse("d.md", source);
        Plan.ExecutionPlan result = Plan.plan(varDoc, reg());
        assertEquals(0, result.examples().size());
        assertEquals(0, result.diagnostics().size());
    }

    @Test
    void planTurnsEachListItemIntoItsOwnExampleOneMatchedStepPerItem() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} in my account", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "I withdraw {int}", "s.ts", 2, NOOP_HANDLER, StepKind.STIMULUS);
        String source = "# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("b.md", source), r);
        assertEquals(2, result.examples().size());
        assertEquals(
                List.of(List.of("I have 100 in my account"), List.of("I withdraw 40")),
                result.examples().stream()
                        .map(e -> e.steps().stream().map(Plan.PlannedStep::text).toList())
                        .toList());
    }

    @Test
    void planWalksBlockquoteContentAsStepBearing() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} in my account", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = "# Quote\n\n> Given I have 100 in my account";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("q.md", source), r);
        assertEquals(1, result.examples().get(0).steps().size());
    }

    @Test
    void aMarkdownTableImmediatelyFollowingAStepBearingBlockAttachesAsDataTable() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "these users exist", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # Users
                Given these users exist:

                | name | age |
                |------|-----|
                | Bob  | 30  |
                | Eve  | 25  |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("u.md", source), r);
        Plan.PlannedStep step = result.examples().get(0).steps().get(0);
        assertEquals(List.of("name", "age"), step.dataTable().header().cells());
        assertEquals(2, step.dataTable().rows().size());
    }

    @Test
    void aTableNotImmediatelyAfterAStepBearingBlockDoesNotAttach() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "these users exist", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        // Paragraph between step and table
        String source = """
                # Mid
                Given these users exist:

                Some interrupting prose.

                | name | age |
                |------|-----|
                | Bob  | 30  |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("m.md", source), r);
        Plan.PlannedStep step = result.examples().get(0).steps().get(0);
        assertNull(step.dataTable());
    }

    @Test
    void aFencedCodeBlockImmediatelyFollowingAStepBearingBlockAttachesAsDocString() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I send the payload", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # Payload
                When I send the payload:

                ```json
                { "action": "import" }
                ```""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("p.md", source), r);
        Plan.PlannedStep step = result.examples().get(0).steps().get(0);
        assertEquals("json", step.docString().info());
        assertEquals("{ \"action\": \"import\" }\n", step.docString().body());
    }

    @Test
    void aStepWithNoFollowingFenceHasNoDocString() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I send the payload", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("p.md", "# P\nWhen I send the payload"), r);
        assertNull(result.examples().get(0).steps().get(0).docString());
    }

    @Test
    void aKeywordLedSentenceWithNoMatchDoesNotProduceADiagnostic() {
        // Step-def generation is selection-driven only; we never infer that a keyword-led
        // sentence "should" have matched a step definition.
        Registry r = Registry.createRegistry();
        Ast.VarDoc varDoc = Parse.parse("m.md", "# Empty\n\nGiven I have 5 cukes in my belly.");
        Plan.ExecutionPlan result = Plan.plan(varDoc, r);
        assertEquals(0, result.diagnostics().size());
    }

    @Test
    void anUnmatchedSentenceWithoutAKeywordIsAlsoSilentlyTreatedAsProse() {
        Registry r = Registry.createRegistry();
        Ast.VarDoc varDoc = Parse.parse("p.md", "# Prose\n\nI have 5 cukes in my belly.");
        Plan.ExecutionPlan result = Plan.plan(varDoc, r);
        assertEquals(0, result.diagnostics().size());
    }

    @Test
    void aHeaderBoundTableExpandsIntoOneExamplePerRow() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(
                r, "each row lists the dice, the category and the score", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # Yahtzee

                each row lists the dice, the category and the score:

                | dice          | category   | score |
                | ------------- | ---------- | ----- |
                | 3, 3, 3, 4, 4 | full house | 17    |
                | 3, 3, 3, 3, 3 | Yahtzee    | 50    |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("y.md", source), r);
        assertEquals(0, result.diagnostics().size());
        // One example per data row (the header row is the binding, not an example).
        assertEquals(2, result.examples().size());
        Plan.PlannedExample first = result.examples().get(0);
        Plan.PlannedExample second = result.examples().get(1);
        // Each row example runs the matched step once, with the row object — keyed by header
        // cell, raw string values — as the trailing handler argument.
        assertEquals(1, first.steps().size());
        assertEquals(
                List.of(java.util.Map.of("dice", "3, 3, 3, 4, 4", "category", "full house", "score", "17")),
                first.steps().get(0).args());
        assertEquals(
                List.of(java.util.Map.of("dice", "3, 3, 3, 3, 3", "category", "Yahtzee", "score", "50")),
                second.steps().get(0).args());
        // The whole table is NOT also handed over in row mode.
        assertNull(first.steps().get(0).dataTable());
    }

    @Test
    void aTableWhoseParagraphNamesOnlySomeHeaderCellsKeepsWholeTableBehaviour() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "these users exist", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        // "these users exist" names neither `name` nor `age` — no row mode.
        String source = """
                # Users
                these users exist:

                | name | age |
                | ---- | --- |
                | Bob  | 30  |
                | Eve  | 25  |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("u.md", source), r);
        assertEquals(1, result.examples().size());
        Plan.PlannedStep step = result.examples().get(0).steps().get(0);
        assertEquals(List.of("name", "age"), step.dataTable().header().cells());
        assertEquals(2, step.dataTable().rows().size());
    }

    @Test
    void headerBoundMatchingIsCaseSensitive() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "each row lists the Dice and the Score", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        // Headers are lower-case `dice`/`score`; the prose says `Dice`/`Score`.
        String source = """
                # Case
                each row lists the Dice and the Score:

                | dice      | score |
                | --------- | ----- |
                | 1,1,1,1,1 | 5     |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("c.md", source), r);
        // No exact-case match → falls back to a single whole-table example.
        assertEquals(1, result.examples().size());
        assertEquals(
                1, result.examples().get(0).steps().get(0).dataTable().rows().size());
    }

    @Test
    void headerBoundRowsAreNamedByTheirCellsAndNestedUnderTheParagraph() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(
                r, "each row lists the dice, the category and the score", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # Yahtzee

                each row lists the dice, the category and the score:

                | dice          | category   | score |
                | ------------- | ---------- | ----- |
                | 3, 3, 3, 4, 4 | full house | 17    |
                | 3, 3, 3, 3, 3 | Yahtzee    | 50    |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("y.md", source), r);
        assertEquals(
                List.of("3, 3, 3, 4, 4 / full house / 17", "3, 3, 3, 3, 3 / Yahtzee / 50"),
                result.examples().stream().map(Plan.PlannedExample::name).toList());
        for (Plan.PlannedExample ex : result.examples()) {
            assertEquals(List.of("Yahtzee", "each row lists the dice, the category and the score"), ex.scopeStack());
        }
        // Each row example maps to its own (distinct, ascending) source line.
        List<Integer> lines =
                result.examples().stream().map(e -> e.span().startLine()).toList();
        Set<Integer> distinct = new LinkedHashSet<>(lines);
        assertEquals(2, distinct.size());
        assertTrue(lines.get(0) < lines.get(1));
    }

    @Test
    void aTableNotAttachedToAStepIsAllowedNoDiagnostic() {
        // Tables are valid Markdown on their own. A table that happens not to follow a
        // step-bearing paragraph is just content, not a mistake.
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # Detached

                Given I have 5 cukes.

                Some interrupting prose paragraph.

                | name | age |
                |------|-----|
                | Bob  | 30  |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("o.md", source), r);
        assertEquals(0, result.diagnostics().size());
    }

    @Test
    void aHeaderBoundRowExampleCarriesRowChecks() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(
                r, "each row lists the dice, the category and the score", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # Yahtzee

                each row lists the dice, the category and the score:

                | dice          | category   | score |
                | ------------- | ---------- | ----- |
                | 3, 3, 3, 4, 4 | full house | 17    |""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("y.md", source), r);
        @SuppressWarnings("unchecked")
        List<CellDiff.RowCheck> checks =
                (List<CellDiff.RowCheck>) result.examples().get(0).rowChecks();
        if (checks == null) fail("no rowChecks");
        assertEquals(
                List.of("dice", "category", "score"),
                checks.stream().map(CellDiff.RowCheck::column).toList());
        assertEquals(
                List.of("3, 3, 3, 4, 4", "full house", "17"),
                checks.stream().map(CellDiff.RowCheck::value).toList());
        // The score cell span slices back to "17" in the source.
        CellDiff.RowCheck scoreCheck = checks.get(2);
        assertEquals(
                "17",
                source.substring(
                        scoreCheck.span().startOffset(), scoreCheck.span().endOffset()));
    }

    @Test
    void anErrorFenceMarksTheExampleExpectedOutcomeFailWithAMessageSubstring() {
        Registry r = Registry.addStep(
                Registry.createRegistry(), "I divide {int} by {int}", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String src = "# Division\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n";
        Plan.PlannedExample ex =
                Plan.plan(Parse.parse("e.md", src), r).examples().get(0);
        assertEquals("fail", ex.expectedOutcome());
        assertEquals("division by zero", ex.expectedErrorMessage());
        // The error fence must NOT become a docString attachment on the step.
        assertNull(ex.steps().get(0).docString());
    }

    @Test
    void noErrorFenceLeavesExpectedOutcomeNull() {
        Registry r = Registry.addStep(
                Registry.createRegistry(), "I divide {int} by {int}", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        Plan.PlannedExample ex = Plan.plan(Parse.parse("e.md", "# Division\n\nI divide 1 by 1."), r)
                .examples()
                .get(0);
        assertNull(ex.expectedOutcome());
    }

    @Test
    void anErrorFenceWithNoMatchingStepEmitsAnErrorFenceWithoutStepDiagnostic() {
        // The prose matches no step, so the expected-failure can never run.
        Registry r = Registry.addStep(
                Registry.createRegistry(), "I divide {int} by {int}", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String src = "# Nope\n\nThis prose matches nothing.\n\n```error\nboom\n```\n";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("e.md", src), r);
        assertEquals(0, result.examples().size());
        assertEquals(1, result.diagnostics().size());
        assertEquals(
                Diagnostics.DiagnosticCode.ERROR_FENCE_WITHOUT_STEP,
                result.diagnostics().get(0).code());
    }

    @Test
    void anErrorFenceOnAnAmbiguousExampleEmitsBothDiagnostics() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I divide {int} by {int}", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "I divide 1 by 0", "s.ts", 2, NOOP_HANDLER, StepKind.STIMULUS);
        String src = "# Ambiguous\n\nI divide 1 by 0.\n\n```error\nboom\n```\n";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("e.md", src), r);
        List<Diagnostics.DiagnosticCode> codes = result.diagnostics().stream()
                .map(Diagnostics.Diagnostic::code)
                .sorted()
                .toList();
        assertEquals(
                List.of(
                        Diagnostics.DiagnosticCode.AMBIGUOUS_MATCH,
                        Diagnostics.DiagnosticCode.ERROR_FENCE_WITHOUT_STEP),
                codes);
    }

    @Test
    void aDocStringStepCarriesTheFenceBodySpanOnItsPlan() {
        Registry r = Registry.addStep(
                Registry.createRegistry(), "the payload is", "s.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        String source = """
                # T

                the payload is:

                ```json
                { "ok": true }
                ```""";
        Plan.ExecutionPlan result = Plan.plan(Parse.parse("d.md", source), r);
        Ast.Fence docString = result.examples().get(0).steps().get(0).docString();
        if (docString == null) fail("no docString");
        assertEquals("{ \"ok\": true }\n", docString.body());
        // The span slices back to the exact body content (trailing newline included).
        assertEquals(
                "{ \"ok\": true }\n",
                source.substring(
                        docString.bodySpan().startOffset(), docString.bodySpan().endOffset()));
    }
}
