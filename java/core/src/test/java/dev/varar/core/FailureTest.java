package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Translated from {@code var-core/tests/failure.test.ts}, adapted for Java's structured {@link
 * StackTraceElement} stack (see {@code Failure.java}'s class javadoc for why): the TS test
 * manually assigns a text {@code err.stack}; here a synthetic {@link StackTraceElement} plays
 * the same role as the frame {@code execute.ts}'s {@code augmentStack} would inject.
 */
class FailureTest {

    @Test
    void toFailureExtractsCellsFromACellMismatchException() {
        String source = "a | 5 |";
        CellDiff.CellMismatchException err = new CellDiff.CellMismatchException(
                List.of(new CellDiff("n", Span.spanFromOffsets(source, 4, 5), "5", "4", false)));
        Result.ExampleFailure f = Failure.toFailure(err, "spec.md", 3);
        assertEquals(List.of(new Result.CellFailure(4, 5, "4")), f.cells());
        assertEquals(String.class, f.message().getClass());
        assertEquals(String.class, f.stack().getClass());
    }

    @Test
    void toFailureExtractsADocStringMismatchAsACell() {
        String source = "Hello!\n";
        CellDiff diff = DocStringDiff.compareDocString("Goodbye!\n", "Hello!\n", Span.spanFromOffsets(source, 0, 7));
        Result.ExampleFailure f =
                Failure.toFailure(new CellDiff.CellMismatchException(java.util.List.of(diff)), "spec.md", 3);
        assertEquals(java.util.List.of(new Result.CellFailure(0, 7, "\"Goodbye!\\n\"")), f.cells());
    }

    @Test
    void toFailureLeavesCellsNullForAPlainExceptionOrReturnShapeException() {
        assertNull(Failure.toFailure(new RuntimeException("nope"), "spec.md", 3).cells());
        assertNull(Failure.toFailure(new CellDiff.ReturnShapeException("bad"), "spec.md", 3)
                .cells());
    }

    @Test
    void toFailureReadsTheFailingLineFromAnInjectedStackFrameElseFallsBack() {
        RuntimeException err = new RuntimeException("boom");
        err.setStackTrace(new StackTraceElement[] {
            new StackTraceElement("Handler", "handle", "steps.java", 1),
            new StackTraceElement("Step", "run", "docs/a.md", 12)
        });
        assertEquals(12, Failure.toFailure(err, "docs/a.md", 99).line());

        RuntimeException noFrame = new RuntimeException("boom");
        noFrame.setStackTrace(new StackTraceElement[] {new StackTraceElement("Handler", "handle", "steps.java", 1)});
        assertEquals(99, Failure.toFailure(noFrame, "docs/a.md", 99).line());
    }

    @Test
    void toFailureRegexEscapesTheSpecPathADotIsLiteral() {
        RuntimeException err = new RuntimeException("boom");
        // 'X' stands in for the dot: if the spec path's `.` were treated as a regex wildcard it
        // would match this frame; escaped, it must not.
        err.setStackTrace(new StackTraceElement[] {new StackTraceElement("Step", "run", "aXmd", 7)});
        // specPath "a.md" must NOT match "aXmd".
        assertEquals(42, Failure.toFailure(err, "a.md", 42).line());
    }
}
