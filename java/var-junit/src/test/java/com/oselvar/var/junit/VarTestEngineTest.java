package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.platform.testkit.engine.EventConditions.container;
import static org.junit.platform.testkit.engine.EventConditions.event;
import static org.junit.platform.testkit.engine.EventConditions.finishedSuccessfully;

import org.junit.jupiter.api.Test;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Proves the var {@link VarTestEngine} is registered via {@code ServiceLoader} and
 * runs an empty discovery/execution cycle cleanly — no discovery/execution logic exists
 * yet (Tasks 9-11), so this only exercises the skeleton.
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

        // The engine's own root container completes successfully with no children:
        // discovery (Tasks 9-10) always returns an empty descriptor for now, so there
        // is exactly one container event (the "var" engine itself) and no test events
        // at all.
        results.containerEvents()
                .assertThatEvents()
                .hasSize(2) // started + finished
                .haveExactly(1, event(container("var"), finishedSuccessfully()));

        results.testEvents().assertThatEvents().isEmpty();
    }
}
