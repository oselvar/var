package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.CellDiff;
import com.oselvar.var.core.DocStringDiff;
import com.oselvar.var.core.Plan;
import com.oselvar.var.runner.StepLoader.LoadedSteps;
import com.oselvar.var.runner.fixtures.BoomSteps;
import com.oselvar.var.runner.fixtures.GreetingSteps;
import com.oselvar.var.runner.fixtures.WidgetSteps;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Confirms {@link Render#renderFailure} is a pure formatter over {@link
 * com.oselvar.var.core.Failure#toFailure}'s {@link com.oselvar.var.core.Result.ExampleFailure}
 * payload — driven by REAL exceptions the core pipeline produces via {@link Run#planSpec}
 * + {@link Run#examplesWithRuns} (same standard as {@code RunTest}), not hand-built
 * {@code Result.ExampleFailure} values.
 */
class RenderTest {

    private static final ClassLoader LOADER = RenderTest.class.getClassLoader();

    @Test
    void rendersACellMismatchWithTheSourceSlicedExpectedValueTheActualValueAndTheLine() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of(WidgetSteps.class.getName()), LOADER);
        String source = "# Widgets\n\nI have 3 widgets. I should have 4 widgets.";
        String path = "widgets.md";
        Plan.ExecutionPlan plan = Run.planSpec(path, source, loaded.registry());

        List<Run.ExampleRun> runs =
                Run.examplesWithRuns(plan, loaded.createContext(), new Run.RecordingReporter());
        CellDiff.CellMismatchException error =
                assertThrows(CellDiff.CellMismatchException.class, () -> runs.get(0).run().run());

        String rendered = Render.renderFailure(error, source, path);

        // "4" is the narrative capture's source text (the expected value, sliced from
        // source — Result.CellFailure stores no separate `expected` field).
        assertTrue(rendered.contains("4"), "expected sliced value: " + rendered);
        // "3" is the sensor's actual returned value; assert the specific `got "3"`
        // rendering (not a bare "3") so this can't pass via the unrelated "line 3".
        assertTrue(rendered.contains("got \"3\""), "actual value: " + rendered);
        assertTrue(rendered.contains("line 3"), "failing line: " + rendered);
    }

    @Test
    void rendersADocStringMismatchWithTheSourceSlicedExpectedValueTheActualValueAndTheLine() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of(GreetingSteps.class.getName()), LOADER);
        String source =
                """
                # T

                the greeting is:

                ```text
                Hello, world!
                ```""";
        String path = "greeting.md";
        Plan.ExecutionPlan plan = Run.planSpec(path, source, loaded.registry());

        List<Run.ExampleRun> runs =
                Run.examplesWithRuns(plan, loaded.createContext(), new Run.RecordingReporter());
        DocStringDiff.DocStringMismatchException error =
                assertThrows(
                        DocStringDiff.DocStringMismatchException.class, () -> runs.get(0).run().run());

        String rendered = Render.renderFailure(error, source, path);

        assertTrue(rendered.contains("Hello, world!"), "expected sliced doc body: " + rendered);
        assertTrue(rendered.contains("Goodbye!"), "actual doc body: " + rendered);
        assertTrue(rendered.contains("line 3"), "failing line: " + rendered);
    }

    @Test
    void rendersAPlainThrownExceptionUsingItsOwnMessageAndTheFailingLine() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of(BoomSteps.class.getName()), LOADER);
        String source = "# Boom\n\nsomething explodes.";
        String path = "boom.md";
        Plan.ExecutionPlan plan = Run.planSpec(path, source, loaded.registry());

        List<Run.ExampleRun> runs =
                Run.examplesWithRuns(plan, loaded.createContext(), new Run.RecordingReporter());
        RuntimeException error =
                assertThrows(RuntimeException.class, () -> runs.get(0).run().run());

        String rendered = Render.renderFailure(error, source, path);

        assertTrue(rendered.contains("boom"), "message: " + rendered);
        assertTrue(rendered.contains("line 3"), "failing line: " + rendered);
    }

    @Test
    void aHandThrownExceptionNotRoutedThroughTheCorePipelineStillRendersItsMessageAndAFallbackLine() {
        // No spec/registry involved at all: renderFailure must still work for an
        // arbitrary Throwable that never passed through Failure.toFailure before —
        // proving it's Failure.toFailure doing the dispatch, not Render re-inspecting
        // the Throwable's type itself.
        String rendered = Render.renderFailure(new RuntimeException("boom"), "irrelevant source", "nowhere.md");
        assertTrue(rendered.contains("boom"), "message: " + rendered);
        assertTrue(rendered.contains("line 1"), "fallback line: " + rendered);
    }
}
