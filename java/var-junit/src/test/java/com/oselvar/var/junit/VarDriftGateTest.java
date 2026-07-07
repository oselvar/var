package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectFile;
import static org.junit.platform.testkit.engine.EventConditions.event;
import static org.junit.platform.testkit.engine.EventConditions.finishedWithFailure;
import static org.junit.platform.testkit.engine.EventConditions.test;
import static org.junit.platform.testkit.engine.TestExecutionResultConditions.message;

import com.oselvar.var.junit.fixtures.WidgetSteps;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/** The JUnit surface of the drift gate: a drifted paragraph fails; -Dvar.update accepts it. */
class VarDriftGateTest {

    private static void writeProject(Path workspace, String baselineExamples) throws Exception {
        Files.writeString(
                workspace.resolve("var.config.json"),
                "{ \"docs\": { \"include\": [\"*.md\"], \"exclude\": [] }, \"steps\": [\""
                        + WidgetSteps.class.getName()
                        + "\"] }",
                StandardCharsets.UTF_8);
        // Prose now — matches no WidgetSteps expression.
        Files.writeString(workspace.resolve("vault.md"), "The vault is sealed.\n", StandardCharsets.UTF_8);
        Files.writeString(
                workspace.resolve("var.lock.json"),
                "{\"version\":1,\"specs\":{\"vault.md\":{\"sourceHash\":\"fnv1a:0\",\"examples\":["
                        + baselineExamples
                        + "]}}}",
                StandardCharsets.UTF_8);
    }

    private static EngineExecutionResults execute(Path workspace) {
        return EngineTestKit.engine("var")
                .selectors(selectFile(workspace.resolve("vault.md").toString()))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .execute();
    }

    @Test
    void aParagraphThatStoppedMatchingFailsAsDrift(@TempDir Path workspace) throws Exception {
        writeProject(workspace, "{\"name\":\"The vault is sealed\",\"line\":1}");
        String before = Files.readString(workspace.resolve("var.lock.json"));

        EngineExecutionResults results = execute(workspace);

        assertEquals(1, results.testEvents().failed().count(), "the drifted paragraph fails");
        results.testEvents()
                .assertThatEvents()
                .haveExactly(1, event(test(), finishedWithFailure(message(m -> m.contains("The vault is sealed")))));
        // Unacknowledged drift leaves the baseline untouched.
        assertEquals(before, Files.readString(workspace.resolve("var.lock.json")));
    }

    @Test
    void varUpdateAcceptsDrift(@TempDir Path workspace) throws Exception {
        writeProject(workspace, "{\"name\":\"The vault is sealed\",\"line\":1}");
        System.setProperty("var.update", "true");
        try {
            EngineExecutionResults results = execute(workspace);
            assertEquals(0, results.testEvents().failed().count(), "update mode accepts the drift");
        } finally {
            System.clearProperty("var.update");
        }
        // The now-prose paragraph is gone from the re-recorded baseline.
        String lock = Files.readString(workspace.resolve("var.lock.json"));
        assertTrue(lock.contains("\"examples\": []"), "baseline re-recorded with no examples:\n" + lock);
    }
}
