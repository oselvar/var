package com.oselvar.var.junit;

import java.util.function.Consumer;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.EngineDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * Root descriptor for the var {@link org.junit.platform.engine.TestEngine TestEngine}.
 *
 * <p>Today this descriptor never has children (discovery — Tasks 9-10 — always returns an
 * empty tree). The {@code ifChildren} guard is ported now anyway, ahead of need, mirroring
 * {@code CucumberEngineDescriptor}: the JUnit Platform always executes every engine that
 * participated in discovery, and in combination with the JUnit Platform Suite Engine this
 * can invoke an engine's lifecycle hooks more than once with nothing to run. Once this
 * descriptor gains real children (spec-file containers, in later tasks), engine-level
 * setup/teardown work added to {@link #prepare}/{@link #before}/{@link #after}/
 * {@link #cleanUp} should only happen when there's actually something to execute.
 */
final class VarEngineDescriptor extends EngineDescriptor implements Node<VarEngineExecutionContext> {

    VarEngineDescriptor(UniqueId uniqueId) {
        super(uniqueId, "var");
    }

    @Override
    public VarEngineExecutionContext prepare(VarEngineExecutionContext context) {
        return ifChildren(context, c -> {});
    }

    @Override
    public VarEngineExecutionContext before(VarEngineExecutionContext context) {
        return ifChildren(context, c -> {});
    }

    @Override
    public void after(VarEngineExecutionContext context) {
        ifChildren(context, c -> {});
    }

    @Override
    public void cleanUp(VarEngineExecutionContext context) {
        ifChildren(context, c -> {});
    }

    private VarEngineExecutionContext ifChildren(
            VarEngineExecutionContext context, Consumer<VarEngineExecutionContext> action) {
        if (!getChildren().isEmpty()) {
            action.accept(context);
        }
        return context;
    }
}
