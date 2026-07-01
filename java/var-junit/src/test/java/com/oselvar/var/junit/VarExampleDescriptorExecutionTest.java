package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClasspathResource;
import static org.junit.platform.testkit.engine.EventConditions.event;
import static org.junit.platform.testkit.engine.EventConditions.finishedSuccessfully;
import static org.junit.platform.testkit.engine.EventConditions.finishedWithFailure;
import static org.junit.platform.testkit.engine.EventConditions.test;
import static org.junit.platform.testkit.engine.TestExecutionResultConditions.instanceOf;
import static org.junit.platform.testkit.engine.TestExecutionResultConditions.message;

import com.oselvar.var.junit.fixtures.CounterSteps;
import com.oselvar.var.junit.fixtures.WidgetSteps;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;
import org.junit.platform.testkit.engine.Event;

/**
 * Proves Task 11's execution wiring end to end through the real {@code EngineTestKit.engine("var")
 * ...execute()} path (not mocks): {@link VarExampleDescriptor#execute} runs the {@link
 * VarFileDescriptor}-cached {@code Run.ExampleRun} for its own {@code Plan.PlannedExample}, reports
 * {@code SUCCESSFUL} on a pass, and on a real cell mismatch reports {@code FAILED} with {@code
 * Render#renderFailure}'s markdown-anchored text as the failure's {@code getMessage()} — including
 * the correct {@code .md} line, proving the stack-injection {@code Execute.runExample} already
 * performs round-trips correctly through {@code var-junit}'s wiring.
 */
class VarExampleDescriptorExecutionTest {

    private static EngineExecutionResults execute(String classpathResource, Class<?> stepsClass) {
        return EngineTestKit.engine("var")
                .selectors(selectClasspathResource(classpathResource))
                .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                .configurationParameter("var.steps", stepsClass.getName())
                .execute();
    }

    @Test
    void aPassingExampleReportsSuccessful() {
        EngineExecutionResults results = execute("examplefixture/widgets.md", WidgetSteps.class);

        results.testEvents()
                .assertThatEvents()
                .haveExactly(2, event(test(), finishedSuccessfully()));
    }

    @Test
    void aFailingExampleReportsFailedWithTheRenderedMarkdownAnchoredMessage() {
        EngineExecutionResults results = execute("examplefixture/failing.md", WidgetSteps.class);

        List<Event> failed = results.testEvents().failed().list();
        assertEquals(1, failed.size(), "failing.md's one example is a genuine cell mismatch");

        results.testEvents()
                .assertThatEvents()
                .haveExactly(
                        1,
                        event(
                                test(),
                                finishedWithFailure(
                                        instanceOf(VarExampleDescriptor.RenderedFailure.class),
                                        message(m -> m.contains("line 3")),
                                        message(m -> m.contains("expected \"4\"")),
                                        message(m -> m.contains("got \"3\"")))));

        // The original CellDiff.CellMismatchException must not be lost -- it's the cause.
        Throwable failure =
                failed.get(0)
                        .getPayload(TestExecutionResult.class)
                        .flatMap(TestExecutionResult::getThrowable)
                        .orElseThrow();
        assertInstanceOf(VarExampleDescriptor.RenderedFailure.class, failure);
        assertTrue(
                failure.getCause().getClass().getName().contains("CellMismatchException"),
                "original exception must be preserved as the cause: " + failure.getCause());
    }

    @Test
    void stateDoesNotLeakBetweenTwoExamplesInTheSameFile() {
        // counter.md has two examples, each independently adding 5 to a freshly-initialized
        // (Ctx(0)) counter and asserting it's exactly 5. If the second example's state leaked
        // from the first (i.e. it did not start from a fresh Ctx(0)), its counter would come
        // out as 10, not 5, and the sensor step would fail -- so both examples reporting
        // SUCCESSFUL is a genuine proof of state isolation, not an assumption.
        EngineExecutionResults results = execute("examplefixture/counter.md", CounterSteps.class);

        results.testEvents()
                .assertThatEvents()
                .haveExactly(2, event(test(), finishedSuccessfully()));
        assertEquals(0, results.testEvents().failed().count(), "state leakage would fail the second example");
    }
}
