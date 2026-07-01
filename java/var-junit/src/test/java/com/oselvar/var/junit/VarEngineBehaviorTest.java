package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClasspathResource;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectUniqueId;
import static org.junit.platform.testkit.engine.EventConditions.event;
import static org.junit.platform.testkit.engine.EventConditions.finishedWithFailure;
import static org.junit.platform.testkit.engine.EventConditions.test;
import static org.junit.platform.testkit.engine.TestExecutionResultConditions.message;

import com.oselvar.var.junit.fixtures.CounterSteps;
import com.oselvar.var.junit.fixtures.WidgetSteps;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.testkit.engine.EngineDiscoveryResults;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Task 13: fills the genuine gaps Tasks 7-12's own test files (each named in their javadocs)
 * left open, rather than re-proving what they already cover. Read against those files first:
 *
 * <ul>
 *   <li>{@code SmokeTest} — module wiring only.
 *   <li>{@code DiscoverySelectorResolverTest} — one container per matching {@code .md} resource,
 *       include/exclude filtering at the container level, via {@code VarTestEngine#discover}
 *       directly (Task 9, containers had no children yet).
 *   <li>{@code ConfigBridgeTest} — {@code ConfigurationParameters} &rarr; {@code VarConfig}
 *       adaptation, including {@code var.steps} parsing into a plain string list (unit-level, no
 *       engine involved).
 *   <li>{@code VarTestEngineTest} — engine id, {@code ServiceLoader} registration, and the
 *       zero-matching-<em>files</em> case (no resource matches {@code var.vars.include} at all).
 *   <li>{@code VarExampleDescriptorTest} — leaf shape, line-based {@code UniqueId}s (not
 *       wording-based), and single-leaf {@code UniqueId} selection <em>at discovery time</em> for
 *       a two-example file, for both classpath-resource and real-file selectors.
 *   <li>{@code VarExampleDescriptorExecutionTest} — a passing example, a single-example file's
 *       failure rendered with its markdown-anchored message (fixed at line 3), and no state
 *       leakage between two examples in the same file (two passes, not a mixed outcome).
 *   <li>{@code ConfigPrecedenceTest} — {@code ConfigurationParameters} provider-tier precedence,
 *       unrelated to {@code var.steps} semantics.
 * </ul>
 *
 * <p>None of the above exercises, in one file with a genuine MIXED outcome: (1) per-example
 * pass/fail COUNTS for a file with more than one outcome; (2) re-running a single example by
 * {@code UniqueId} through actual EXECUTION (not just discovery) when its siblings include a
 * failure; (3) a failure line other than the one hardcoded fixture line (3) already proven
 * elsewhere, to rule out the line lookup being coincidentally right only for that line; or (4)
 * {@code var.steps} actually gating which step-definition classes get loaded, end to end through
 * the real engine, as opposed to {@code ConfigBridgeTest}'s isolated parsing check or Task 4's
 * {@code var-runner}-only {@code StepLoaderTest}. This class fills exactly those four.
 */
class VarEngineBehaviorTest {

    private static final String WIDGET_STEPS = WidgetSteps.class.getName();
    private static final String COUNTER_STEPS = CounterSteps.class.getName();

    /**
     * {@code examplefixture/mixed.md} has three {@link WidgetSteps}-matched examples: line 3
     * (3 == 3, passes), line 7 (3 != 5, fails), line 11 (9 == 9, passes) — deliberately not all
     * failing or all passing, and with the one failure on a line {@code
     * VarExampleDescriptorExecutionTest}'s {@code failing.md} never exercises (line 3), so the
     * line lookup driving the rendered message is proven for more than one coincidental value.
     */
    @Test
    void mixedFileReportsExactPerExamplePassAndFailCountsWithLineAnchoredFailure() {
        EngineExecutionResults results = executeMixed();

        assertEquals(2, results.testEvents().succeeded().count(), "two of mixed.md's three examples pass");
        assertEquals(1, results.testEvents().failed().count(), "exactly one of mixed.md's three examples fails");

        results.testEvents()
                .assertThatEvents()
                .haveExactly(
                        1,
                        event(
                                test(),
                                finishedWithFailure(
                                        message(m -> m.contains("line 7")),
                                        message(m -> m.contains("expected \"5\"")),
                                        message(m -> m.contains("got \"3\"")))));
    }

    /**
     * Discovers {@code mixed.md} fully once (as a real caller would, to learn its examples'
     * {@code UniqueId}s from a previous run), then re-submits only the failing example's {@code
     * UniqueId} for execution — proving both that execution-time re-selection of a single example
     * works (not just discovery-time selection, which {@code VarExampleDescriptorTest} already
     * covers) and that it does so correctly when the file's OTHER examples would pass: exactly one
     * test event runs, and it is the failing one, not a sibling.
     */
    @Test
    void reRunningOneFailingExampleByUniqueIdAmongThreeExecutesOnlyThatOneExample() {
        EngineDiscoveryResults discovery = discoverMixed();
        TestDescriptor fileDescriptor = onlySpecDescriptor(discovery.getEngineDescriptor());
        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(3, examples.size(), "mixed.md has three examples");

        UniqueId failingExampleId = examples.get(1).getUniqueId(); // line 7, the one that fails

        EngineExecutionResults results =
                EngineTestKit.engine("var")
                        .selectors(selectUniqueId(failingExampleId))
                        .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                        .configurationParameter("var.steps", WIDGET_STEPS)
                        .execute();

        results.testEvents().assertThatEvents().hasSize(2); // started + finished, for that one example only
        assertEquals(1, results.testEvents().failed().count(), "the selected example must be the only one that runs");
        results.testEvents()
                .assertThatEvents()
                .haveExactly(1, event(test(), finishedWithFailure(message(m -> m.contains("line 7")))));
    }

    /**
     * Same file, same {@code var.vars.include}, only {@code var.steps} changes — proving {@code
     * var.steps} is genuinely load-bearing end to end through the real engine, not merely parsed
     * (as {@code ConfigBridgeTest} already confirms in isolation) and then ignored in favor of some
     * other source of steps (e.g. scanning every {@code StepDefinitions} on the classpath).
     * {@code widgets.md}'s sentences match only {@link WidgetSteps}' expressions; {@link
     * CounterSteps}' expressions ("I add {int} to the counter" / "the counter should be {int}")
     * match nothing in it. Per {@code Plan.plan}'s documented behavior (confirmed against {@code
     * var-core}'s own {@code PlanTest#planSkipsAnExampleHeadingWhoseBodyHasNoMatchesAndNoKeywordLedSentences}),
     * a paragraph matching no loaded step is silently skipped — zero examples, not an error — so
     * loading only {@code CounterSteps} must discover nothing for this file, and a childless
     * container is itself pruned by the Launcher (per {@code DiscoverySelectorResolverTest}'s
     * javadoc), leaving zero children at the engine root entirely.
     */
    @Test
    void varStepsOnlyLoadsTheNamedClassesNotEveryStepDefinitionOnTheClasspath() {
        EngineDiscoveryResults onlyCounterSteps =
                EngineTestKit.engine("var")
                        .selectors(selectClasspathResource("examplefixture/widgets.md"))
                        .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                        .configurationParameter("var.steps", COUNTER_STEPS)
                        .discover();
        assertTrue(
                onlyCounterSteps.getEngineDescriptor().getChildren().isEmpty(),
                "CounterSteps' expressions don't match widgets.md's sentences -- var.steps must be"
                        + " the only source of loaded steps, so nothing survives discovery (and the"
                        + " resulting childless container is itself pruned)");

        EngineDiscoveryResults bothSteps =
                EngineTestKit.engine("var")
                        .selectors(selectClasspathResource("examplefixture/widgets.md"))
                        .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                        .configurationParameter("var.steps", COUNTER_STEPS + "," + WIDGET_STEPS)
                        .discover();
        TestDescriptor fileDescriptor = onlySpecDescriptor(bothSteps.getEngineDescriptor());
        assertEquals(
                2,
                fileDescriptor.getChildren().size(),
                "adding WidgetSteps back to var.steps (comma-separated) must recover both examples --"
                        + " proving the zero-examples result above was really var.steps at work, not"
                        + " e.g. widgets.md being unparsable for an unrelated reason");
    }

    private static EngineDiscoveryResults discoverMixed() {
        return EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/mixed.md"))
                .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                .configurationParameter("var.steps", WIDGET_STEPS)
                .discover();
    }

    private static EngineExecutionResults executeMixed() {
        return EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/mixed.md"))
                .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                .configurationParameter("var.steps", WIDGET_STEPS)
                .execute();
    }

    private static TestDescriptor onlySpecDescriptor(TestDescriptor engineDescriptor) {
        List<? extends TestDescriptor> children = List.copyOf(engineDescriptor.getChildren());
        assertEquals(1, children.size(), "expected exactly one spec container");
        return children.get(0);
    }
}
