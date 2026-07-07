package com.oselvar.var.junit;

import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.AbstractTestDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * A failing leaf for a drifted paragraph — one the committed {@code var.lock.json} baseline
 * recorded as an example that now matches no step. The JUnit surface of the drift gate: it always
 * fails, so the build goes red until the step is fixed or the drift is accepted (re-run with
 * {@code -Dvar.update} / {@code VAR_UPDATE=1}). Added by {@link VarFileSelectorResolver} alongside
 * the file's example leaves.
 *
 * <p>{@code UniqueId} segment type {@link #SEGMENT_TYPE} ({@code "drift"}), value {@code
 * "drift-<line>"} — deliberately distinct from {@link VarExampleDescriptor}'s bare-line values so
 * it never collides with, or is mistaken for, an example leaf.
 */
final class VarDriftDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "drift";

    private final String message;

    VarDriftDescriptor(UniqueId uniqueId, String displayName, TestSource source, String message) {
        super(uniqueId, displayName, source);
        this.message = message;
    }

    @Override
    public Type getType() {
        return Type.TEST;
    }

    @Override
    public VarEngineExecutionContext execute(
            VarEngineExecutionContext context, DynamicTestExecutor dynamicTestExecutor) {
        throw new DriftFailure(message);
    }

    /** Reports the drift message as the failure's {@code getMessage()}. */
    static final class DriftFailure extends RuntimeException {
        DriftFailure(String message) {
            super(message);
        }
    }
}
