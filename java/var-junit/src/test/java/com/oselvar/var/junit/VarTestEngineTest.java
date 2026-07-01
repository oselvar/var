package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectPackage;
import static org.junit.platform.testkit.engine.EventConditions.container;
import static org.junit.platform.testkit.engine.EventConditions.event;
import static org.junit.platform.testkit.engine.EventConditions.finishedSuccessfully;

import org.junit.jupiter.api.Test;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Proves the var {@link VarTestEngine} is registered via {@code ServiceLoader} and that a
 * discovery/execution cycle with zero matching {@code .md} files runs cleanly end to end
 * through the real {@code EngineTestKit.engine("var")...execute()} path (discovery/execution
 * logic itself — Tasks 9-11 — is exercised in depth by {@code DiscoverySelectorResolverTest},
 * {@code VarExampleDescriptorTest}, and {@code VarExampleDescriptorExecutionTest}).
 */
class VarTestEngineTest {

    @Test
    void getIdReturnsVar() {
        assertEquals("var", new VarTestEngine().getId());
    }

    @Test
    void isDiscoverableByEngineIdViaServiceLoader() {
        // EngineTestKit.engine("var") resolves the engine by id through the Platform's
        // own ServiceLoader-based engine registry -- it does not accept an instance
        // here, so this line alone proves the META-INF/services registration works.
        EngineExecutionResults results = EngineTestKit.engine("var").execute();

        // No configuration parameters and no selectors are supplied, so var.vars.include
        // defaults to empty (CLAUDE.md: no default include) and nothing is even attempted
        // to be resolved: there is exactly one container event (the "var" engine itself)
        // and no test events at all.
        results.containerEvents()
                .assertThatEvents()
                .hasSize(2) // started + finished
                .haveExactly(1, event(container("var"), finishedSuccessfully()));

        results.testEvents().assertThatEvents().isEmpty();
    }

    @Test
    void zeroMatchingFilesRunsNoTestsAndReportsSuccess() {
        // discoveryfixture/ has two real .md files on the classpath (included.md,
        // excluded.md, used by DiscoverySelectorResolverTest) -- unlike
        // isDiscoverableByEngineIdViaServiceLoader above, this test actively selects that
        // package and gives the resolver a chance to match something, but var.vars.include
        // is a glob that matches neither file. This is Task 12's "real zero-matching-files
        // scenario" (mirrors CucumberEngineDescriptor's rationale for VarEngineDescriptor's
        // ifChildren guard, ported in Task 7): confirms discovery correctly produces zero
        // children (not merely "nothing was selected"), and that the engine's root
        // container -- whose prepare/before/after/cleanUp all route through that guard --
        // still completes successfully with no test events and no failures. The guard's
        // action is currently a no-op (see VarEngineDescriptor's Javadoc: no lifecycle work
        // exists yet to skip), so there is nothing further to observe about the guard
        // itself beyond this outcome.
        EngineExecutionResults results =
                EngineTestKit.engine("var")
                        .selectors(selectPackage("discoveryfixture"))
                        .configurationParameter("var.vars.include", "nowhere/**/*.md")
                        .execute();

        results.containerEvents()
                .assertThatEvents()
                .hasSize(2) // started + finished
                .haveExactly(1, event(container("var"), finishedSuccessfully()));

        results.testEvents().assertThatEvents().isEmpty();
        assertEquals(0, results.allEvents().failed().count(), "zero matching files must never fail the run");
    }
}
