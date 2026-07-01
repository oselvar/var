package com.oselvar.var.junit;

import java.util.Objects;
import org.junit.platform.engine.EngineExecutionListener;
import org.junit.platform.engine.support.hierarchical.EngineExecutionContext;

/**
 * Per-run state threaded through the var {@link org.junit.platform.engine.TestEngine
 * TestEngine}'s descriptor tree during execution.
 *
 * <p>Carries the real {@link EngineExecutionListener} from the {@code
 * org.junit.platform.engine.ExecutionRequest} that started this run (set once, at
 * construction, by {@link VarTestEngine#createExecutionContext}) — the only place a {@link
 * org.junit.platform.engine.support.hierarchical.Node Node} like {@link VarFileDescriptor} can
 * reach it, since {@code Node} methods never receive the listener directly. {@link
 * VarFileDescriptor#before} uses it to publish plan-stage diagnostics (Task 16) via {@link
 * EngineExecutionListener#reportingEntryPublished}.
 */
final class VarEngineExecutionContext implements EngineExecutionContext {

    private final EngineExecutionListener listener;

    VarEngineExecutionContext(EngineExecutionListener listener) {
        this.listener = Objects.requireNonNull(listener, "listener");
    }

    /** The listener {@code reportingEntryPublished} (and friends) must be called on. */
    EngineExecutionListener listener() {
        return listener;
    }
}
