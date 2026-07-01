package com.oselvar.var.runner;

import com.oselvar.var.core.Diagnostics;
import com.oselvar.var.core.Execute;
import com.oselvar.var.core.Parse;
import com.oselvar.var.core.Plan;
import com.oselvar.var.core.Registry;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Bridges {@code var-core}'s pure {@code Plan}/{@code Execute} pipeline into a
 * runner-friendly shape: plan a spec in one call ({@link #planSpec}), then pair each
 * {@link Plan.PlannedExample} with a {@link Runnable} that actually runs it ({@link
 * #examplesWithRuns}) — mirrors Python's {@code examples_with_runs}.
 *
 * <p>Deliberately thin: all matching/planning/execution logic stays in {@code var-core}
 * ({@link Plan}, {@link Execute}); this class only parses+plans in one call and zips
 * {@link Execute#collectExamples}'s result with {@link Plan.ExecutionPlan#examples()}.
 */
public final class Run {

    private Run() {}

    /** Parses {@code source} and plans it against {@code registry} in one call. */
    public static Plan.ExecutionPlan planSpec(String path, String source, Registry registry) {
        return Plan.plan(Parse.parse(path, source), registry);
    }

    /** One planned example paired with the {@link Runnable} that actually runs it. */
    public record ExampleRun(Plan.PlannedExample example, Runnable run) {}

    /**
     * Reports every diagnostic in {@code plan} via {@code reporter} (through {@link
     * Execute#collectExamples}), then returns one {@link ExampleRun} per {@link
     * Plan.PlannedExample}, in document order — the same order {@code plan.examples()}
     * and {@link Execute#collectExamples}'s returned queue both already preserve, zipped
     * pairwise here.
     *
     * <p>No {@link Execute.ExecutionObserver} is passed to {@link Execute#collectExamples}
     * — confirmed by reading {@code Execute.runExample}'s {@code
     * if (ports.observer() != null)} guards, a {@code null} observer is the documented
     * "don't observe" case, not a missing no-op instance this caller would need to supply.
     */
    public static List<ExampleRun> examplesWithRuns(
            Plan.ExecutionPlan plan, Function<String, Object> createContext, Execute.Reporter reporter) {
        List<Execute.QueuedExample> queued =
                Execute.collectExamples(plan, new Execute.ExecutePorts(reporter, createContext, null));
        List<Plan.PlannedExample> examples = plan.examples();
        List<ExampleRun> runs = new ArrayList<>(queued.size());
        for (int i = 0; i < queued.size(); i++) {
            runs.add(new ExampleRun(examples.get(i), queued.get(i).run()));
        }
        return List.copyOf(runs);
    }

    /**
     * A minimal {@link Execute.Reporter} that just collects every diagnostic it's given,
     * in the order received. Lives in {@code var-runner}'s main sources (not test-only)
     * because {@code var-junit} needs SOME {@link Execute.Reporter} implementation too —
     * this trivial one is reusable there rather than duplicated.
     */
    public static final class RecordingReporter implements Execute.Reporter {
        private final List<Diagnostics.Diagnostic> diagnostics = new ArrayList<>();

        @Override
        public void diagnostic(Diagnostics.Diagnostic diagnostic) {
            diagnostics.add(diagnostic);
        }

        /** Every diagnostic reported so far, in the order received. */
        public List<Diagnostics.Diagnostic> diagnostics() {
            return List.copyOf(diagnostics);
        }
    }
}
