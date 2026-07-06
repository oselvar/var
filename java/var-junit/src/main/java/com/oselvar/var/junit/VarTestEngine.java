package com.oselvar.var.junit;

import com.oselvar.var.config.VarConfig;
import com.oselvar.var.runner.StepLoader;
import org.junit.platform.engine.EngineDiscoveryRequest;
import org.junit.platform.engine.ExecutionRequest;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.discovery.DiscoveryIssueReporter;
import org.junit.platform.engine.support.hierarchical.HierarchicalTestEngine;

/**
 * The var {@link org.junit.platform.engine.TestEngine TestEngine} (id {@code "var"}).
 *
 * <p>Registered via {@code META-INF/services/org.junit.platform.engine.TestEngine} —
 * installing the {@code var-junit} dependency is the entire integration story; no user
 * wiring is required (mirrors {@code var-pytest}'s {@code pytest11} entry-point
 * ergonomics). See {@code doc/adr/0003-java-junit-integration.md}.
 *
 * <p>{@link #discover} loads every {@code steps} class named by var.config.json exactly once per
 * discovery pass ({@link StepLoader#loadSteps}, mirroring Python's {@code pytest_configure}) —
 * cached on the returned {@link VarEngineDescriptor} — then resolves the request's selectors
 * ({@link DiscoverySelectorResolver}) into one {@link VarFileDescriptor} container per {@code .md}
 * spec matching {@code docsInclude}/{@code docsExclude} ({@link ConfigBridge}), each with one
 * {@link VarExampleDescriptor} leaf per {@link com.oselvar.var.core.Plan.PlannedExample} planned
 * against that shared, merged registry. It does not yet execute anything (Task 11).
 */
public final class VarTestEngine extends HierarchicalTestEngine<VarEngineExecutionContext> {

    @Override
    public String getId() {
        return "var";
    }

    @Override
    public TestDescriptor discover(EngineDiscoveryRequest discoveryRequest, UniqueId uniqueId) {
        VarEngineDescriptor engineDescriptor = new VarEngineDescriptor(uniqueId);
        VarConfig config = ConfigBridge.fromConfigurationParameters(discoveryRequest.getConfigurationParameters());
        StepLoader.LoadedSteps loadedSteps =
                StepLoader.loadSteps(config.steps(), Thread.currentThread().getContextClassLoader());
        engineDescriptor.setLoadedSteps(loadedSteps);
        DiscoveryIssueReporter issueReporter =
                DiscoveryIssueReporter.forwarding(discoveryRequest.getDiscoveryListener(), uniqueId);
        new DiscoverySelectorResolver(
                        config, ConfigBridge.rootFrom(discoveryRequest.getConfigurationParameters()), loadedSteps)
                .resolveSelectors(discoveryRequest, engineDescriptor, issueReporter);
        return engineDescriptor;
    }

    @Override
    protected VarEngineExecutionContext createExecutionContext(ExecutionRequest request) {
        return new VarEngineExecutionContext(request.getEngineExecutionListener());
    }
}
