package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClasspathResource;
import static org.junit.platform.testkit.engine.EventConditions.container;
import static org.junit.platform.testkit.engine.EventConditions.event;
import static org.junit.platform.testkit.engine.EventConditions.reportEntry;

import com.oselvar.var.junit.fixtures.AmbiguousSteps;
import com.oselvar.var.junit.fixtures.CounterSteps;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Task 16: a plan-stage diagnostic (Task 11 built a {@code Run.RecordingReporter} to satisfy
 * {@code Execute.ExecutePorts} but then discarded {@code .diagnostics()}) must actually reach
 * JUnit reporting/IDEs via {@code EngineExecutionListener#reportingEntryPublished}, not just be
 * collected and dropped.
 *
 * <p>{@code examplefixture/ambiguous.md} paired with {@link AmbiguousSteps} mirrors conformance
 * bundle {@code 05-ambiguous-match}: two step expressions both match "I have 5 cukes", so {@code
 * Plan.plan} emits one {@code ambiguous-match} diagnostic and the affected example still plans
 * (with zero steps) and passes vacuously — per bundle 05's own {@code golden/trace.json} — the
 * diagnostic is the only signal something's wrong.
 */
class VarDiagnosticsReportingTest {

    private static final String AMBIGUOUS_STEPS = AmbiguousSteps.class.getName();

    @Test
    void ambiguousMatchDiagnosticIsPublishedAsAReportEntryOnTheFileContainer(@TempDir Path workspace) throws Exception {
        EngineExecutionResults results = executeAmbiguous(workspace);

        assertEquals(
                1,
                results.testEvents().succeeded().count(),
                "the ambiguous example still plans (zero steps) and passes vacuously");
        assertEquals(
                1,
                results.containerEvents().reportingEntryPublished().count(),
                "exactly one plan diagnostic (ambiguous-match) for ambiguous.md's single sentence");

        results.containerEvents()
                .assertThatEvents()
                .haveExactly(
                        1,
                        event(
                                container(),
                                reportEntry(Map.of(
                                        "code", "AMBIGUOUS_MATCH",
                                        "severity", "ERROR",
                                        "line", "3"))));
    }

    @Test
    void aFileWithNoDiagnosticsPublishesNoReportingEntries(@TempDir Path workspace) throws Exception {
        Files.writeString(
                workspace.resolve("var.config.json"),
                """
                {
                  "docs": { "include": ["examplefixture/counter.md"], "exclude": [] },
                  "steps": ["%s"]
                }
                """.formatted(CounterSteps.class.getName()),
                StandardCharsets.UTF_8);
        EngineExecutionResults results = EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/counter.md"))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .execute();

        assertEquals(
                0,
                results.containerEvents().reportingEntryPublished().count(),
                "counter.md's sentences match unambiguously -- no plan diagnostics, so nothing to report");
    }

    private static EngineExecutionResults executeAmbiguous(Path workspace) throws Exception {
        Files.writeString(workspace.resolve("var.config.json"), """
                {
                  "docs": { "include": ["examplefixture/ambiguous.md"], "exclude": [] },
                  "steps": ["%s"]
                }
                """.formatted(AMBIGUOUS_STEPS), StandardCharsets.UTF_8);
        return EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/ambiguous.md"))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .execute();
    }
}
