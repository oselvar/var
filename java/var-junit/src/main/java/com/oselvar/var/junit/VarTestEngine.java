package com.oselvar.var.junit;

import org.junit.platform.engine.EngineDiscoveryRequest;
import org.junit.platform.engine.ExecutionRequest;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.hierarchical.HierarchicalTestEngine;

/**
 * The var {@link org.junit.platform.engine.TestEngine TestEngine} (id {@code "var"}).
 *
 * <p>Registered via {@code META-INF/services/org.junit.platform.engine.TestEngine} —
 * installing the {@code var-junit} dependency is the entire integration story; no user
 * wiring is required (mirrors {@code var-pytest}'s {@code pytest11} entry-point
 * ergonomics). See {@code docs/adr/0003-java-junit-integration.md}.
 *
 * <p>This is the discovery/execution SKELETON: {@link #discover} always returns an empty
 * {@link VarEngineDescriptor} (no children). Resolving discovery selectors into one
 * container per spec file and one leaf per example is Tasks 9-10; leaf execution against
 * var-runner is Task 11.
 */
public final class VarTestEngine extends HierarchicalTestEngine<VarEngineExecutionContext> {

    @Override
    public String getId() {
        return "var";
    }

    @Override
    public TestDescriptor discover(EngineDiscoveryRequest discoveryRequest, UniqueId uniqueId) {
        return new VarEngineDescriptor(uniqueId);
    }

    @Override
    protected VarEngineExecutionContext createExecutionContext(ExecutionRequest request) {
        return new VarEngineExecutionContext();
    }
}
