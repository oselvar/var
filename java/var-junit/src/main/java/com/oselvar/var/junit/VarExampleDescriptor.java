package com.oselvar.var.junit;

import com.oselvar.var.core.Plan;
import com.oselvar.var.runner.Render;
import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.AbstractTestDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * One leaf per {@link Plan.PlannedExample}, a child of the {@link VarFileDescriptor} its example
 * was planned from.
 *
 * <p>{@code UniqueId} segment type {@link #SEGMENT_TYPE} ({@code "example"}), value = {@code
 * example.span().startLine()} as a decimal string — deliberately <strong>not</strong> {@link
 * Plan.PlannedExample#name()} (the display name, derived from the example's Markdown text, shown
 * via {@link #getDisplayName()}). The design doc ({@code
 * doc/superpowers/specs/2026-07-01-java-junit-engine-design.md}) flags this as a hard
 * requirement, not a nice-to-have: a {@code UniqueId} built from wording would change whenever an
 * author edits a sentence without moving the example, silently breaking {@code UniqueIdSelector}
 * re-run-single-test (an IDE's "re-run this test" action round-trips the {@code UniqueId} it
 * captured on a previous run — if that id no longer resolves to the same example, or resolves to
 * a different one, the re-run silently does the wrong thing).
 *
 * <p>{@link #getSource()} is a {@code FileSource}/{@code ClasspathResourceSource} with a {@code
 * FilePosition} at that same {@code startLine()} — {@link Plan.PlannedExample} spans are 1-based
 * (see {@code Span}'s javadoc) and {@code FilePosition} requires line numbers greater than zero
 * (confirmed by reading {@code FilePosition}'s source), so no conversion is needed.
 *
 * <p>Retains the {@link Plan.PlannedExample} itself so it can be run; the registry/{@code
 * createContext}/source text it was planned against are reachable via its parent {@link
 * VarFileDescriptor} rather than duplicated here.
 *
 * <h2>Execution (Task 11)</h2>
 *
 * <p>{@link #execute} looks up ITS OWN {@link com.oselvar.var.runner.Run.ExampleRun} from the
 * parent {@link VarFileDescriptor}'s cache ({@link VarFileDescriptor#runFor}) rather than
 * re-planning or re-collecting anything — planning already happened once, at discovery. On
 * success it returns normally, so JUnit Platform reports {@code SUCCESSFUL} (its own default). On
 * the underlying {@code Runnable} throwing, the caught {@code Throwable} — already carrying an
 * injected {@link StackTraceElement} pointing at the failing step's {@code .md} location, per
 * {@code Execute.runExample}'s {@code augmentStack} — is rendered via {@link Render#renderFailure}
 * into markdown-anchored text, then wrapped in {@link RenderedFailure} (preserving the original as
 * {@link Throwable#getCause()}) and thrown; JUnit Platform's {@code
 * TestExecutionResult.failed(Throwable)} then reports {@code getMessage()} from THAT wrapper.
 */
final class VarExampleDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "example";

    private final Plan.PlannedExample example;

    VarExampleDescriptor(UniqueId uniqueId, String displayName, TestSource source, Plan.PlannedExample example) {
        super(uniqueId, displayName, source);
        this.example = example;
    }

    @Override
    public Type getType() {
        return Type.TEST;
    }

    /** The example this leaf was planned from. */
    Plan.PlannedExample example() {
        return example;
    }

    @Override
    public VarEngineExecutionContext execute(VarEngineExecutionContext context, DynamicTestExecutor dynamicTestExecutor)
            throws Exception {
        VarFileDescriptor fileDescriptor = fileDescriptor();
        Runnable run = fileDescriptor.runFor(example);
        try {
            run.run();
        } catch (Throwable error) {
            String rendered = Render.renderFailure(error, fileDescriptor.content(), fileDescriptor.specPath());
            throw new RenderedFailure(rendered, error);
        }
        return context;
    }

    /**
     * This leaf's parent, always a {@link VarFileDescriptor} — every {@link
     * VarExampleDescriptor} is created and immediately added as a child of exactly one, by {@link
     * VarFileSelectorResolver#createDescriptor}, so by execution time (long after discovery)
     * {@link #getParent()} is populated.
     */
    private VarFileDescriptor fileDescriptor() {
        return (VarFileDescriptor)
                getParent().orElseThrow(() -> new IllegalStateException("no parent for " + getUniqueId()));
    }

    /**
     * Wraps a caught step failure so JUnit Platform's {@code TestExecutionResult.failed(...)}
     * reports {@link Render}'s markdown-anchored text as {@link #getMessage()}, without losing
     * the original exception's identity or stack trace — preserved whole as {@link #getCause()}.
     */
    static final class RenderedFailure extends RuntimeException {
        RenderedFailure(String renderedMessage, Throwable cause) {
            super(renderedMessage, cause);
        }
    }
}
