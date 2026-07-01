package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.oselvar.var.core.CellDiff;
import com.oselvar.var.core.Diagnostics;
import com.oselvar.var.core.Plan;
import com.oselvar.var.core.Registry;
import com.oselvar.var.core.StepKind;
import com.oselvar.var.runner.StepLoader.LoadedSteps;
import com.oselvar.var.runner.fixtures.WidgetSteps;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Confirms {@link Run#planSpec} and {@link Run#examplesWithRuns} bridge {@code
 * Plan.plan}/{@code Execute.collectExamples} into runnable {@link Run.ExampleRun} pairs,
 * using a real {@link WidgetSteps} fixture loaded via {@link StepLoader} — a passing
 * example's {@code run()} completes silently, and a genuinely mismatching example's
 * {@code run()} throws the real {@link CellDiff.CellMismatchException} the core
 * pipeline produces, not a hand-thrown stand-in.
 */
class RunTest {

    private static final ClassLoader LOADER = RunTest.class.getClassLoader();

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    private static LoadedSteps loadWidgetSteps() {
        return StepLoader.loadSteps(List.of(WidgetSteps.class.getName()), LOADER);
    }

    @Test
    void planSpecParsesAndPlansInOneStep() {
        LoadedSteps loaded = loadWidgetSteps();
        String source = "# Widgets\n\nI have 3 widgets. I should have 3 widgets.";
        Plan.ExecutionPlan plan = Run.planSpec("widgets.md", source, loaded.registry());
        assertEquals(1, plan.examples().size());
        assertEquals(0, plan.diagnostics().size());
    }

    @Test
    void examplesWithRunsPreservesDocumentOrderAndPassingRunDoesNotThrow() {
        LoadedSteps loaded = loadWidgetSteps();
        String source =
                "# Widgets\n\nI have 3 widgets. I should have 3 widgets.\n\n"
                        + "# More widgets\n\nI have 9 widgets. I should have 9 widgets.";
        Plan.ExecutionPlan plan = Run.planSpec("widgets.md", source, loaded.registry());

        Run.RecordingReporter reporter = new Run.RecordingReporter();
        List<Run.ExampleRun> runs = Run.examplesWithRuns(plan, loaded.createContext(), reporter);

        assertEquals(2, runs.size());
        // Order preservation: each ExampleRun's example is plan.examples() at the same index.
        assertEquals(plan.examples().get(0), runs.get(0).example());
        assertEquals(plan.examples().get(1), runs.get(1).example());

        assertDoesNotThrow(() -> runs.get(0).run().run());
        assertDoesNotThrow(() -> runs.get(1).run().run());
        assertEquals(List.of(), reporter.diagnostics());
    }

    @Test
    void examplesWithRunsSurfacesARealCellMismatchExceptionOnAFailingExample() {
        LoadedSteps loaded = loadWidgetSteps();
        // The sensor reports 3, but the spec asserts 4 — a genuine mismatch the core
        // pipeline detects itself, not a hand-thrown generic exception.
        String source = "# Widgets\n\nI have 3 widgets. I should have 4 widgets.";
        Plan.ExecutionPlan plan = Run.planSpec("widgets.md", source, loaded.registry());

        List<Run.ExampleRun> runs =
                Run.examplesWithRuns(plan, loaded.createContext(), new Run.RecordingReporter());
        assertEquals(1, runs.size());

        CellDiff.CellMismatchException e =
                assertThrows(CellDiff.CellMismatchException.class, () -> runs.get(0).run().run());
        assertEquals(1, e.cells().size());
        assertEquals("3", e.cells().get(0).actual());
        assertEquals("4", e.cells().get(0).expected());
    }

    @Test
    void recordingReporterCollectsDiagnosticsReportedDuringCollectExamples() {
        // Two DIFFERENT expressions both matching "I have 3 widgets" — a genuine
        // ambiguous-match diagnostic Plan.plan detects itself, reported (not thrown)
        // via Reporter when examplesWithRuns drives Execute.collectExamples.
        LoadedSteps loaded = loadWidgetSteps();
        Registry ambiguousRegistry =
                Registry.addStep(
                        loaded.registry(), "I have 3 widgets", "extra.ts", 1, NOOP_HANDLER, StepKind.CONTEXT);
        Plan.ExecutionPlan plan =
                Run.planSpec("widgets.md", "# Widgets\n\nI have 3 widgets.", ambiguousRegistry);
        assertEquals(1, plan.diagnostics().size());
        assertEquals(Diagnostics.DiagnosticCode.AMBIGUOUS_MATCH, plan.diagnostics().get(0).code());

        Run.RecordingReporter reporter = new Run.RecordingReporter();
        Run.examplesWithRuns(plan, loaded.createContext(), reporter);
        assertEquals(1, reporter.diagnostics().size());
        assertEquals(Diagnostics.DiagnosticCode.AMBIGUOUS_MATCH, reporter.diagnostics().get(0).code());
    }
}
