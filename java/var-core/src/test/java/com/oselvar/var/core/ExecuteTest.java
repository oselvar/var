package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * Translated from {@code var-core/tests/execute.test.ts}, {@code execute-state.test.ts}, and
 * {@code execute-roles.test.ts}, adapted to Task 11's full-replacement record state model and
 * this task's sensor return-comparison contract (see {@link Execute}'s class javadoc).
 *
 * <p>Several TS cases are intentionally NOT translated 1:1 — see the Task 18 report:
 *
 * <ul>
 *   <li>{@code deep-freeze.test.ts} in full, and {@code execute-state.test.ts}'s "mutating the
 *       (post-merge) frozen state throws" cases — Task 11's record state model needs no runtime
 *       mutation guard (see {@link Execute}'s DeepFreeze-decision javadoc).
 *   <li>{@code execute-roles.test.ts}'s "an action/context/sensor that returns a value throws
 *       ReturnShapeError" — Java's typed {@code Context0/1/2} always returns a full state by
 *       construction, so there's no runtime shape to violate.
 *   <li>{@code execute.test.ts}'s "sensor returns the wrong tuple length" — Java's sensors return
 *       one value, not a tuple (see {@link Execute}'s sensor-contract javadoc).
 * </ul>
 */
class ExecuteTest {

    /**
     * Minimal test-local functional interfaces shaped like {@code com.oselvar.var.StateBinder}'s
     * {@code Context0/1/2}/{@code Sensor0/1/2} — WITHOUT importing them. {@code var-core} has no
     * dependency on the {@code var} module (hexagonal architecture: the core never imports the
     * facade), and {@link Execute} invokes a handler purely via reflection matched by arity,
     * regardless of which concrete functional interface it implements. Using ad hoc interfaces
     * here that {@code Execute.java} has never heard of is itself evidence of that decoupling.
     */
    @FunctionalInterface
    interface Fn0 {
        Object call(Object state);
    }

    @FunctionalInterface
    interface Fn1 {
        Object call(Object state, Object a);
    }

    @FunctionalInterface
    interface Fn2 {
        Object call(Object state, Object a, Object b);
    }

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    private static Registry reg(String expression, String file, int line, Object handler, StepKind kind) {
        return Registry.addStep(Registry.createRegistry(), expression, file, line, handler, kind);
    }

    private static Plan.ExecutionPlan planOf(String source, Registry registry) {
        return Plan.plan(Parse.parse("x.md", source), registry);
    }

    private static Execute.ExecutePorts silentPorts() {
        return new Execute.ExecutePorts(d -> {});
    }

    // -----------------------------------------------------------------------------------------
    // collectExamples: naming, ordering, diagnostics
    // -----------------------------------------------------------------------------------------

    @Test
    void collectExamplesReturnsOneQueuedExamplePerPlannedExampleInDocumentOrder() {
        Registry r = reg("I have {int} cukes", "s.ts", 1, (Fn1) (state, n) -> null, StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI have 5 cukes\n\n# B\n\nI have 9 cukes", r);
        List<Execute.QueuedExample> queued = Execute.collectExamples(p, silentPorts());
        assertEquals(
                List.of("I have 5 cukes", "I have 9 cukes"),
                queued.stream().map(Execute.QueuedExample::name).toList());
    }

    @Test
    void collectExamplesReportsDiagnosticsViaReporter() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I have {int} cukes", "a.ts", 1, NOOP_HANDLER, StepKind.ACTION);
        r = Registry.addStep(r, "I have 5 cukes", "a.ts", 2, NOOP_HANDLER, StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# M\n\nI have 5 cukes", r);
        List<Diagnostics.Diagnostic> got = new ArrayList<>();
        Execute.collectExamples(p, new Execute.ExecutePorts(got::add));
        assertEquals(1, got.size());
        assertEquals(Diagnostics.DiagnosticCode.AMBIGUOUS_MATCH, got.get(0).code());
    }

    // -----------------------------------------------------------------------------------------
    // Full-replacement state evolution + inline sensor comparison
    // -----------------------------------------------------------------------------------------

    @Test
    void runningAQueuedExampleThreadsFullReplacementStateAcrossActionStepsAndTheSensorComparesItsReturnAgainstTheLastCapturedArg() {
        List<Object> seen = new ArrayList<>();
        Registry r = Registry.createRegistry();
        r =
                Registry.addStep(
                        r,
                        "I add {int}",
                        "s.ts",
                        1,
                        (Fn1) (state, n) -> (state == null ? 0 : (Integer) state) + (Integer) n,
                        StepKind.ACTION);
        r =
                Registry.addStep(
                        r,
                        "the total is {int}",
                        "s.ts",
                        2,
                        (Fn1) (state, expected) -> {
                            seen.add(expected);
                            return state;
                        },
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf("# Adding\n\nI add 5. I add 3. the total is 8.", r);
        Execute.ExecutePorts ports = new Execute.ExecutePorts(d -> {}, file -> 0, null);
        List<Execute.QueuedExample> queued = Execute.collectExamples(p, ports);
        assertEquals(1, queued.size());
        assertDoesNotThrow(() -> queued.get(0).run().run());
        assertEquals(List.of(8), seen);
    }

    @Test
    void anInlineSensorReturnValueMismatchingTheLastCapturedArgThrowsCellMismatchExceptionAtItsParamSpan() {
        Registry r = reg("the answer is {int}", "s.ts", 1, (Fn1) (state, expected) -> 41, StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf("# Q\n\nthe answer is 42.", r);
        CellDiff.CellMismatchException ex =
                assertThrows(
                        CellDiff.CellMismatchException.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals(1, ex.cells().size());
        assertEquals("42", ex.cells().get(0).expected());
        assertEquals("41", ex.cells().get(0).actual());
        String source = p.varDoc().source();
        Span span = ex.cells().get(0).span();
        assertEquals("42", source.substring(span.startOffset(), span.endOffset()));
    }

    // -----------------------------------------------------------------------------------------
    // createContext: once per (example, file), reused across steps in the same file
    // -----------------------------------------------------------------------------------------

    @Test
    void createContextIsCalledFreshOncePerExample() {
        List<Object> seen = new ArrayList<>();
        Registry r =
                reg(
                        "I record ctx",
                        "s.ts",
                        1,
                        (Fn0)
                                state -> {
                                    seen.add(state);
                                    return state;
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI record ctx\n\n# B\n\nI record ctx", r);
        int[] calls = {0};
        Function<String, Object> createContext =
                file -> {
                    calls[0]++;
                    return "init" + calls[0];
                };
        Execute.ExecutePorts ports = new Execute.ExecutePorts(d -> {}, createContext, null);
        for (Execute.QueuedExample q : Execute.collectExamples(p, ports)) q.run().run();
        assertEquals(2, calls[0]);
        assertEquals(List.of("init1", "init2"), seen);
    }

    @Test
    void stateIsThreadedAcrossStepsSharingTheSameFileWithinAnExampleNoNewContextPerStep() {
        List<Object> seen = new ArrayList<>();
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I seed", "s.ts", 1, (Fn0) state -> "seeded", StepKind.ACTION);
        r =
                Registry.addStep(
                        r,
                        "I record ctx",
                        "s.ts",
                        2,
                        (Fn0)
                                state -> {
                                    seen.add(state);
                                    return state;
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI seed\nI record ctx", r);
        int[] calls = {0};
        Function<String, Object> createContext =
                file -> {
                    calls[0]++;
                    return "unseeded";
                };
        Execute.ExecutePorts ports = new Execute.ExecutePorts(d -> {}, createContext, null);
        Execute.collectExamples(p, ports).get(0).run().run();
        assertEquals(1, calls[0]);
        assertEquals(List.of("seeded"), seen);
    }

    // -----------------------------------------------------------------------------------------
    // Trailing data table / doc string appended as the last handler argument
    // -----------------------------------------------------------------------------------------

    @Test
    void aDataTableAttachedToAContextStepIsAppendedAsTheLastHandlerArgument() {
        List<Object> captured = new ArrayList<>();
        Registry r =
                reg(
                        "these books exist:",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, table) -> {
                                    captured.add(table);
                                    return state;
                                },
                        StepKind.CONTEXT);
        String source =
                """
                # Library

                these books exist:

                | title  | author  |
                |--------|---------|
                | Lolita | Nabokov |
                | Anna   | Tolstoy |""";
        Plan.ExecutionPlan p = planOf(source, r);
        Execute.collectExamples(p, silentPorts()).get(0).run().run();
        assertEquals(1, captured.size());
        assertEquals(
                List.of(
                        List.of("title", "author"),
                        List.of("Lolita", "Nabokov"),
                        List.of("Anna", "Tolstoy")),
                captured.get(0));
    }

    @Test
    void aDocStringAttachedToAContextStepIsAppendedAsTheLastHandlerArgument() {
        List<Object> captured = new ArrayList<>();
        Registry r =
                reg(
                        "the receipt is:",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, body) -> {
                                    captured.add(body);
                                    return state;
                                },
                        StepKind.CONTEXT);
        String source =
                """
                # Library

                the receipt is:

                ```json
                {"ok": true}
                ```""";
        Plan.ExecutionPlan p = planOf(source, r);
        Execute.collectExamples(p, silentPorts()).get(0).run().run();
        assertEquals(List.of("{\"ok\": true}\n"), captured);
    }

    // -----------------------------------------------------------------------------------------
    // Header-bound table: one example per row, row map as the trailing sensor arg
    // -----------------------------------------------------------------------------------------

    private static final String YAHTZEE =
            """
            # Yahtzee

            each row lists the dice, the category and the score:

            | dice          | category   | score |
            | ------------- | ---------- | ----- |
            | 3, 3, 3, 4, 4 | full house | 17    |
            | 3, 3, 3, 3, 3 | Yahtzee    | 50    |""";

    @Test
    void headerBoundTableRunsOncePerRowNamedByItsCellsPassingTheRowMapAsTheTrailingArg() {
        List<Object> rows = new ArrayList<>();
        Registry r =
                reg(
                        "each row lists the dice, the category and the score",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, row) -> {
                                    rows.add(row);
                                    return row;
                                },
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(YAHTZEE, r);
        List<Execute.QueuedExample> queued = Execute.collectExamples(p, silentPorts());
        assertEquals(
                List.of("3, 3, 3, 4, 4 / full house / 17", "3, 3, 3, 3, 3 / Yahtzee / 50"),
                queued.stream().map(Execute.QueuedExample::name).toList());
        for (Execute.QueuedExample q : queued) q.run().run();
        assertEquals(
                List.of(
                        Map.of("dice", "3, 3, 3, 4, 4", "category", "full house", "score", "17"),
                        Map.of("dice", "3, 3, 3, 3, 3", "category", "Yahtzee", "score", "50")),
                rows);
    }

    @Test
    void aMismatchingHeaderBoundRowThrowsCellMismatchExceptionAtTheCellSpan() {
        Registry r =
                reg(
                        "each row lists the dice, the category and the score",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, row) -> {
                                    @SuppressWarnings("unchecked")
                                    Map<String, String> m = (Map<String, String>) row;
                                    String score = m.get("score");
                                    return Map.of(
                                            "dice", m.get("dice"),
                                            "category", m.get("category"),
                                            "score", "50".equals(score) ? "999" : score);
                                },
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(YAHTZEE, r);
        List<Execute.QueuedExample> queued = Execute.collectExamples(p, silentPorts());
        assertDoesNotThrow(() -> queued.get(0).run().run()); // 17 -> unchanged -> passes
        CellDiff.CellMismatchException ex =
                assertThrows(CellDiff.CellMismatchException.class, () -> queued.get(1).run().run());
        assertEquals(1, ex.cells().size());
        CellDiff cell = ex.cells().get(0);
        assertEquals("score", cell.column());
        assertEquals("50", cell.expected());
        assertEquals("999", cell.actual());
        String source = p.varDoc().source();
        assertEquals("50", source.substring(cell.span().startOffset(), cell.span().endOffset()));
    }

    // -----------------------------------------------------------------------------------------
    // Whole-table sensor (0 captures, table attached): returned value IS the whole table
    // -----------------------------------------------------------------------------------------

    private static final String UPPERCASE_TABLE =
            """
            # T

            uppercase each one:

            | before | after |
            | ------ | ----- |
            | var    | VAR   |
            | bdd    | BDD   |""";

    @Test
    void aWholeTableSensorReturningAMismatchedTableThrowsCellMismatchExceptionAtTheCellSpan() {
        Registry r =
                reg(
                        "uppercase each one",
                        "s.ts",
                        1,
                        (Fn1) (state, table) -> List.of(List.of("var", "WRONG"), List.of("bdd", "BDD")),
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(UPPERCASE_TABLE, r);
        CellDiff.CellMismatchException ex =
                assertThrows(
                        CellDiff.CellMismatchException.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals(1, ex.cells().size());
        assertEquals("VAR", ex.cells().get(0).expected());
        assertEquals("WRONG", ex.cells().get(0).actual());
    }

    @Test
    void aWholeTableSensorReturningAMatchingTablePasses() {
        Registry r =
                reg(
                        "uppercase each one",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, table) ->
                                        List.of(
                                                Map.of("before", "var", "after", "VAR"),
                                                Map.of("before", "bdd", "after", "BDD")),
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(UPPERCASE_TABLE, r);
        assertDoesNotThrow(() -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    @Test
    void aWholeTableSensorReturningTheWrongTypeThrowsReturnShapeException() {
        Registry r = reg("uppercase each one", "s.ts", 1, (Fn1) (state, table) -> "not a table", StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(UPPERCASE_TABLE, r);
        assertThrows(
                CellDiff.ReturnShapeException.class,
                () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    // -----------------------------------------------------------------------------------------
    // Doc-string sensor (0 captures, doc string attached): returned value IS the doc string
    // -----------------------------------------------------------------------------------------

    private static final String GREETING_DOC =
            """
            # T

            the greeting is:

            ```text
            Hello, world!
            ```""";

    @Test
    void aDocStringSensorReturningADifferentStringThrowsDocStringMismatchExceptionAtTheBodySpan() {
        Registry r = reg("the greeting is", "s.ts", 1, (Fn1) (state, body) -> "Goodbye!\n", StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(GREETING_DOC, r);
        DocStringDiff.DocStringMismatchException ex =
                assertThrows(
                        DocStringDiff.DocStringMismatchException.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals("Hello, world!\n", ex.diff().expected());
        assertEquals("Goodbye!\n", ex.diff().actual());
    }

    @Test
    void aDocStringSensorReturningTheExactBodyPasses() {
        Registry r = reg("the greeting is", "s.ts", 1, (Fn1) (state, body) -> body, StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf(GREETING_DOC, r);
        assertDoesNotThrow(() -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    // -----------------------------------------------------------------------------------------
    // error-fence convention: inverts outcome
    // -----------------------------------------------------------------------------------------

    @Test
    void errorFenceExampleWhereTheStepThrowsAMatchingMessagePasses() {
        Registry r =
                reg(
                        "I divide {int} by {int}",
                        "s.ts",
                        1,
                        (Fn2)
                                (state, a, b) -> {
                                    if (((Integer) b) == 0) throw new RuntimeException("division by zero");
                                    return state;
                                },
                        StepKind.ACTION);
        String src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n";
        Plan.ExecutionPlan p = planOf(src, r);
        assertDoesNotThrow(() -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    @Test
    void errorFenceExampleWhereNoThrowThrowsUnexpectedPassException() {
        Registry r = reg("I divide {int} by {int}", "s.ts", 1, (Fn2) (state, a, b) -> state, StepKind.ACTION);
        String src = "# D\n\nI divide 1 by 1.\n\n```error\n```\n";
        Plan.ExecutionPlan p = planOf(src, r);
        assertThrows(
                Execute.UnexpectedPassException.class,
                () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    @Test
    void errorFenceExampleWithMismatchingMessageRethrowsTheRealError() {
        Registry r =
                reg(
                        "I divide {int} by {int}",
                        "s.ts",
                        1,
                        (Fn2)
                                (state, a, b) -> {
                                    throw new RuntimeException("boom");
                                },
                        StepKind.ACTION);
        String src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n";
        Plan.ExecutionPlan p = planOf(src, r);
        RuntimeException ex =
                assertThrows(
                        RuntimeException.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals("boom", ex.getMessage());
    }

    // -----------------------------------------------------------------------------------------
    // Return-vs-throw parity (Task 11 review finding, resolved by this task — see Execute's
    // class javadoc): a sensor that THROWS an assertion-style failure (AssertionError, an
    // Error subtype, not RuntimeException) must get the same treatment as one that returns a
    // mismatching value — stack injection, observer notification, and error-fence inversion.
    // -----------------------------------------------------------------------------------------

    @Test
    void aSensorThatThrowsAnAssertionErrorInsteadOfReturningAMismatchGetsAStackInjectedFailure() {
        Registry r =
                reg(
                        "the total should be {int}",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, expected) -> {
                                    throw new AssertionError("expected " + expected + " but was 41");
                                },
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf("# Q\n\nthe total should be 42.", r);
        Plan.PlannedStep step = p.examples().get(0).steps().get(0);
        Throwable caught =
                assertThrows(
                        AssertionError.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals("expected 42 but was 41", caught.getMessage());
        // Stack injection still applies to an Error, not just a RuntimeException.
        Result.ExampleFailure failure = Failure.toFailure(caught, p.varDoc().path(), -1);
        assertEquals(step.matchSpan().startLine(), failure.line());
    }

    @Test
    void anErrorFenceExampleWhereTheStepThrowsAnAssertionErrorMatchingTheExpectedMessagePasses() {
        Registry r =
                reg(
                        "the total should be {int}",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, expected) -> {
                                    throw new AssertionError("boom");
                                },
                        StepKind.SENSOR);
        String src = "# Q\n\nthe total should be 42.\n\n```error\nboom\n```\n";
        Plan.ExecutionPlan p = planOf(src, r);
        assertDoesNotThrow(() -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    @Test
    void observerReceivesAFailObservationWhenASensorThrowsAnAssertionErrorNotJustARuntimeException() {
        Registry r =
                reg(
                        "the total should be {int}",
                        "s.ts",
                        1,
                        (Fn1)
                                (state, expected) -> {
                                    throw new AssertionError("boom");
                                },
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf("# Q\n\nthe total should be 42.", r);
        List<Execute.StepObservation> obs = new ArrayList<>();
        Execute.ExecutePorts ports = new Execute.ExecutePorts(d -> {}, null, obs::add);
        assertThrows(AssertionError.class, () -> Execute.collectExamples(p, ports).get(0).run().run());
        assertEquals(1, obs.size());
        assertEquals("fail", obs.get(0).outcome());
        assertNotNull(obs.get(0).error());
    }

    // -----------------------------------------------------------------------------------------
    // Observer
    // -----------------------------------------------------------------------------------------

    @Test
    void observerReceivesAPassObservationPerExecutedStep() {
        Registry r = reg("I add {int}", "s.ts", 1, (Fn1) (state, n) -> state, StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI add 5.", r);
        List<Execute.StepObservation> obs = new ArrayList<>();
        Execute.ExecutePorts ports = new Execute.ExecutePorts(d -> {}, null, obs::add);
        Execute.collectExamples(p, ports).get(0).run().run();
        assertEquals(List.of(new Execute.StepObservation(0, 1, "pass", null)), obs);
    }

    @Test
    void observerReceivesAFailObservationWhenAStepThrows() {
        Registry r =
                reg(
                        "I blow up",
                        "s.ts",
                        1,
                        (Fn0)
                                state -> {
                                    throw new RuntimeException("kaboom");
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI blow up.", r);
        List<Execute.StepObservation> obs = new ArrayList<>();
        Execute.ExecutePorts ports = new Execute.ExecutePorts(d -> {}, null, obs::add);
        assertThrows(RuntimeException.class, () -> Execute.collectExamples(p, ports).get(0).run().run());
        assertEquals(1, obs.size());
        assertEquals(0, obs.get(0).exampleIndex());
        assertEquals(1, obs.get(0).ordinal());
        assertEquals("fail", obs.get(0).outcome());
        assertNotNull(obs.get(0).error());
    }

    // -----------------------------------------------------------------------------------------
    // Stack injection <-> Failure.toFailure integration (the real Task 15/17/18 seam)
    // -----------------------------------------------------------------------------------------

    @Test
    void aThrownStepGetsAnInjectedStackFrameThatFailureToFailureResolvesToTheMdLine() {
        Registry r =
                reg(
                        "I throw",
                        "s.ts",
                        1,
                        (Fn0)
                                state -> {
                                    throw new RuntimeException("boom");
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI throw", r);
        Plan.PlannedStep step = p.examples().get(0).steps().get(0);
        RuntimeException caught =
                assertThrows(
                        RuntimeException.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals("boom", caught.getMessage());
        Result.ExampleFailure failure = Failure.toFailure(caught, p.varDoc().path(), -1);
        assertEquals(step.matchSpan().startLine(), failure.line());
        assertEquals("boom", failure.message());
    }

    // -----------------------------------------------------------------------------------------
    // Async: handlers may return a CompletableFuture, sync or failing
    // -----------------------------------------------------------------------------------------

    @Test
    void anActionHandlerReturningACompletableFutureIsAwaitedAndItsResultBecomesTheNewState() {
        List<Object> seen = new ArrayList<>();
        Registry r = Registry.createRegistry();
        r =
                Registry.addStep(
                        r,
                        "I greet asynchronously",
                        "s.ts",
                        1,
                        (Fn0) state -> CompletableFuture.supplyAsync(() -> "hi"),
                        StepKind.ACTION);
        r =
                Registry.addStep(
                        r,
                        "observe",
                        "s.ts",
                        2,
                        (Fn0)
                                state -> {
                                    seen.add(state);
                                    return state;
                                },
                        StepKind.SENSOR);
        Plan.ExecutionPlan p = planOf("# A\n\nI greet asynchronously\nobserve", r);
        Execute.collectExamples(p, silentPorts()).get(0).run().run();
        assertEquals(List.of("hi"), seen);
    }

    @Test
    void anAsyncHandlerThatCompletesExceptionallyPropagatesItsCauseNotACompletionExceptionWrapper() {
        Registry r =
                reg(
                        "I fail asynchronously",
                        "s.ts",
                        1,
                        (Fn0)
                                state -> {
                                    CompletableFuture<Object> f = new CompletableFuture<>();
                                    f.completeExceptionally(new RuntimeException("async boom"));
                                    return f;
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI fail asynchronously", r);
        RuntimeException ex =
                assertThrows(
                        RuntimeException.class,
                        () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
        assertEquals("async boom", ex.getMessage());
    }

    // -----------------------------------------------------------------------------------------
    // executePlan: eager, fail-fast run-everything driver
    // -----------------------------------------------------------------------------------------

    @Test
    void executePlanRunsEveryExampleWhenNoneFail() {
        List<String> ran = new ArrayList<>();
        Registry r =
                reg(
                        "I run",
                        "s.ts",
                        1,
                        (Fn0)
                                state -> {
                                    ran.add("ran");
                                    return state;
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI run\n\n# B\n\nI run", r);
        assertDoesNotThrow(() -> Execute.executePlan(p, silentPorts()));
        assertEquals(List.of("ran", "ran"), ran);
    }

    @Test
    void executePlanPropagatesTheFirstFailureAndDoesNotRunSubsequentExamples() {
        boolean[] secondRan = {false};
        Registry r = Registry.createRegistry();
        r =
                Registry.addStep(
                        r,
                        "I fail",
                        "s.ts",
                        1,
                        (Fn0)
                                state -> {
                                    throw new RuntimeException("boom");
                                },
                        StepKind.ACTION);
        r =
                Registry.addStep(
                        r,
                        "I succeed",
                        "s.ts",
                        2,
                        (Fn0)
                                state -> {
                                    secondRan[0] = true;
                                    return state;
                                },
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI fail\n\n# B\n\nI succeed", r);
        assertThrows(RuntimeException.class, () -> Execute.executePlan(p, silentPorts()));
        assertFalse(secondRan[0]);
    }

    // -----------------------------------------------------------------------------------------
    // Wiring: a null step kind is an error; invocation isn't tied to any specific interface
    // -----------------------------------------------------------------------------------------

    @Test
    void aNullStepKindThrowsAReturnShapeException() {
        Registry r = reg("I do a thing", "s.ts", 1, (Fn0) state -> state, null);
        Plan.ExecutionPlan p = planOf("# A\n\nI do a thing", r);
        assertThrows(
                CellDiff.ReturnShapeException.class,
                () -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }

    @Test
    void handlerInvocationWorksForAnyFunctionalInterfaceNotJustTheLocalFnShapes() {
        Registry r =
                reg(
                        "I use a jdk functional interface",
                        "s.ts",
                        1,
                        (Function<Object, Object>) state -> "ok",
                        StepKind.ACTION);
        Plan.ExecutionPlan p = planOf("# A\n\nI use a jdk functional interface", r);
        assertDoesNotThrow(() -> Execute.collectExamples(p, silentPorts()).get(0).run().run());
    }
}
