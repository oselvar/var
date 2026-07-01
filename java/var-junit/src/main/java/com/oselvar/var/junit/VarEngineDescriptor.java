package com.oselvar.var.junit;

import com.oselvar.var.runner.StepLoader;
import java.util.function.Consumer;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.EngineDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * Root descriptor for the var {@link org.junit.platform.engine.TestEngine TestEngine}.
 *
 * <p>Holds the session-scoped {@link StepLoader.LoadedSteps} that {@link VarTestEngine#discover}
 * builds exactly once per discovery pass (before resolving any file selectors — mirrors Python's
 * {@code pytest_configure}), so every {@link VarFileDescriptor}/{@link VarExampleDescriptor}
 * planned during that same pass shares one merged {@code Registry} rather than each file
 * reloading+recompiling every step class's expressions from scratch.
 *
 * <p>The {@code ifChildren} guard is ported now anyway, ahead of need, mirroring {@code
 * CucumberEngineDescriptor}: the JUnit Platform always executes every engine that participated in
 * discovery, and in combination with the JUnit Platform Suite Engine this can invoke an engine's
 * lifecycle hooks more than once with nothing to run. Once this descriptor's lifecycle hooks grow
 * real engine-level setup/teardown work (execution — Task 11), that work added to {@link
 * #prepare}/{@link #before}/{@link #after}/{@link #cleanUp} should only happen when there's
 * actually something to execute.
 */
final class VarEngineDescriptor extends EngineDescriptor implements Node<VarEngineExecutionContext> {

    private StepLoader.LoadedSteps loadedSteps;

    VarEngineDescriptor(UniqueId uniqueId) {
        super(uniqueId, "var");
    }

    /** Set once by {@link VarTestEngine#discover}, before resolving any file selectors. */
    void setLoadedSteps(StepLoader.LoadedSteps loadedSteps) {
        this.loadedSteps = loadedSteps;
    }

    /** The session-scoped, once-per-discovery-pass merged steps ({@code null} before discovery). */
    StepLoader.LoadedSteps loadedSteps() {
        return loadedSteps;
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
