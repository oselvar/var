package dev.varar.junit;

import dev.varar.core.Diagnostics;
import dev.varar.core.Plan;
import dev.varar.runner.Run;
import dev.varar.runner.StepLoader;
import java.util.List;
import java.util.Map;
import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.reporting.ReportEntry;
import org.junit.platform.engine.support.descriptor.AbstractTestDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * One container per discovered {@code .md} spec resource/file.
 *
 * <p>{@code UniqueId} segment type {@link #SEGMENT_TYPE} ({@code "spec"}), value = the
 * resource's relative path, POSIX-separated (mirrors {@code
 * cucumber-junit-platform-engine}'s {@code "feature"} segment). The display name is the same
 * relative path.
 *
 * <p>Carries this file's resolved source text, the session-scoped {@link StepLoader.LoadedSteps}
 * it was planned against, and the resulting {@link Plan.ExecutionPlan} — all read/computed once,
 * by {@link VarFileSelectorResolver}, at discovery time. One {@link VarExampleDescriptor} child is
 * added per {@link Plan.PlannedExample} in {@link Plan.ExecutionPlan#examples()}; execution reaches
 * this data either straight from an example leaf's parent, or via {@link #plan()}/{@link
 * #loadedSteps()}/{@link #content()} directly.
 *
 * <h2>Execution (Task 11)</h2>
 *
 * <p>{@link Run#examplesWithRuns} is called exactly ONCE per file, in {@link #before}, and its
 * result cached in {@link #exampleRuns} — mirroring how {@link StepLoader#loadSteps} is cached
 * once-per-discovery-pass (Task 10), rather than re-planning/re-collecting per leaf. {@link
 * Node}'s contract guarantees {@link #before} completes, for this whole container, strictly
 * before any child's {@code execute()} runs (even under parallel execution, which this engine
 * doesn't enable yet, but a sibling's own state is never touched by this caching — see {@link
 * #runFor}'s javadoc) — so the one-time computation here is race-free without extra
 * synchronization. Each {@link VarExampleDescriptor} leaf looks its own {@link Run.ExampleRun} up
 * from this cached list via {@link #runFor}, keyed by {@link Plan.PlannedExample} equality (a
 * {@code record}, so value-based) rather than re-deriving anything at execution time.
 */
final class VarFileDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "spec";

    private final String specPath;
    private final String content;
    private final StepLoader.LoadedSteps loadedSteps;
    private final Plan.ExecutionPlan plan;

    /** Populated once by {@link #before}, before any child's {@code execute()} runs. */
    private List<Run.ExampleRun> exampleRuns;

    VarFileDescriptor(
            UniqueId uniqueId,
            String specPath,
            TestSource source,
            String content,
            StepLoader.LoadedSteps loadedSteps,
            Plan.ExecutionPlan plan) {
        super(uniqueId, specPath, source);
        this.specPath = specPath;
        this.content = content;
        this.loadedSteps = loadedSteps;
        this.plan = plan;
    }

    @Override
    public Type getType() {
        return Type.CONTAINER;
    }

    /**
     * Keeps this file container in the tree even with no example children, as long as its plan
     * carries a diagnostic to surface. Under ADR 0012 an ambiguous-only (or
     * error-fence-without-step) file plans to zero examples, but its {@code ambiguous-match} /
     * {@code error-fence-without-step} diagnostic must still reach JUnit reporting via {@link
     * #before} (see {@link #publishDiagnostics}). The hierarchical engine's default {@code prune()}
     * removes any childless non-root container before execution, which would silently drop the
     * diagnostic — so a childless-but-diagnostic container opts out of that pruning.
     */
    @Override
    public void prune() {
        if (getChildren().isEmpty() && !plan.diagnostics().isEmpty()) {
            return;
        }
        super.prune();
    }

    /** This file's raw source text, as read at discovery time. */
    String content() {
        return content;
    }

    /**
     * This file's path, exactly as passed to {@link Run#planSpec} at discovery time — the same
     * string an injected failure stack frame's {@code fileName} carries, so it must be passed
     * unchanged to {@code Render.renderFailure} for {@code Failure.toFailure}'s failing-line
     * lookup to find it.
     */
    String specPath() {
        return specPath;
    }

    /** The session-scoped, once-per-discovery-pass merged steps this file was planned against. */
    StepLoader.LoadedSteps loadedSteps() {
        return loadedSteps;
    }

    /** The {@code var-core} plan this file's children ({@link VarExampleDescriptor}) were built from. */
    Plan.ExecutionPlan plan() {
        return plan;
    }

    @Override
    public VarEngineExecutionContext before(VarEngineExecutionContext context) {
        // Run.examplesWithRuns only zips plan.examples() with the lazy Runnables
        // Execute.collectExamples produces — no example actually runs here; each Runnable
        // creates its own fresh per-(example, file) state when IT is invoked (see
        // Execute.runExample), so caching this list introduces no shared mutable state
        // between examples, in or out of document order.
        Run.RecordingReporter reporter = new Run.RecordingReporter();
        exampleRuns = Run.examplesWithRuns(plan, loadedSteps.createContext(), reporter);
        publishDiagnostics(context, reporter.diagnostics());
        return context;
    }

    /**
     * Surfaces every plan-stage diagnostic (Task 16) — e.g. bundle 05's {@code ambiguous-match},
     * bundle 10's {@code error-fence-without-step} — collected above via {@link
     * Run.RecordingReporter}. Without this, they're silently swallowed: the affected example
     * either passes vacuously or produces zero examples, with no signal reaching JUnit
     * reporting/IDEs.
     *
     * <p>Reported against this file container itself, one {@link ReportEntry} per diagnostic, via
     * {@code context}'s {@link org.junit.platform.engine.EngineExecutionListener} (threaded in
     * from the real {@code ExecutionRequest} by {@link VarTestEngine#createExecutionContext} —
     * {@link Node#before} never receives a listener directly). File-level, not matched back to a
     * specific example leaf: {@code Diagnostics.Diagnostic} carries a {@code span}, but pinning it
     * to one of this file's {@link VarExampleDescriptor} children would require matching span
     * ranges against {@link Plan.PlannedExample#span()} for no clear benefit over just reporting
     * the line — not attempted here, per the task's own "don't over-engineer" guidance.
     */
    private void publishDiagnostics(VarEngineExecutionContext context, List<Diagnostics.Diagnostic> diagnostics) {
        for (Diagnostics.Diagnostic diagnostic : diagnostics) {
            context.listener()
                    .reportingEntryPublished(
                            this,
                            ReportEntry.from(Map.of(
                                    "code", diagnostic.code().name(),
                                    "severity", diagnostic.severity().name(),
                                    "line", String.valueOf(diagnostic.span().startLine()))));
        }
    }

    /**
     * The {@link Run.ExampleRun} planned for {@code example}, looked up from the list {@link
     * #before} cached once for this whole file — never recomputed per leaf. {@code example} is
     * matched by {@code equals()} against {@link Run.ExampleRun#example()}: {@link
     * Plan.PlannedExample} is a plain {@code record}, so this is a value comparison, robust
     * whether or not the two sides happen to be the same object reference.
     *
     * @throws IllegalStateException if called before {@link #before}, or with an {@code example}
     *     this file's plan never produced (both would be this engine's own bug, not a runtime
     *     input to defend against).
     */
    Runnable runFor(Plan.PlannedExample example) {
        if (exampleRuns == null) {
            throw new IllegalStateException("runFor() called before before(): " + specPath);
        }
        for (Run.ExampleRun run : exampleRuns) {
            if (run.example().equals(example)) {
                return run.run();
            }
        }
        throw new IllegalStateException("no ExampleRun found for " + example + " in " + specPath);
    }
}
