package com.oselvar.var.junit;

import org.junit.platform.engine.support.hierarchical.EngineExecutionContext;

/**
 * Per-run state threaded through the var {@link org.junit.platform.engine.TestEngine
 * TestEngine}'s descriptor tree during execution.
 *
 * <p>Empty for now. Discovery (Tasks 9-10) populates the descriptor tree; execution (Task
 * 11) is expected to grow this type with whatever per-run state calling into var-runner's
 * {@code runSpec}/{@code runOne} needs (e.g. the loaded {@code Registry}). Kept
 * deliberately minimal until that's a concrete requirement — mirrors
 * {@code CucumberEngineExecutionContext}'s role, not its contents.
 */
final class VarEngineExecutionContext implements EngineExecutionContext {}
