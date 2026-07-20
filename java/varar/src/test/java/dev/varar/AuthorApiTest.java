package dev.varar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.StepKind;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Proves the author API can express the {@code 01-roman-numerals} conformance bundle
 * naturally and that its full-replacement record state model round-trips. This is the
 * Java sibling of {@code numerals.steps.ts} / {@code numerals.steps.py}.
 *
 * <p>Assertions run against the real {@link dev.varar.core.Registry} that {@link
 * Steps#bind} produces — {@link Steps} is a concrete builder, so there is nothing to
 * double.
 */
class AuthorApiTest {

    /** Roman-numerals authored against the API shape. */
    static final class RomanNumeralSteps implements StepDefinitions<RomanNumeralSteps.Ctx> {
        record Ctx(String result) implements State {}

        static final Map<Integer, String> ROMAN = Map.of(1, "I", 4, "IV", 9, "IX", 40, "XL");

        @Override
        public void register(Steps<Ctx> s) {
            s.state(() -> new Ctx(null));

            s.stimulus("I convert {int} to roman numerals", (Ctx ctx, Integer n) -> new Ctx(ROMAN.get(n)));

            s.sensor("The result is {word}", (Ctx ctx, String expected) -> ctx.result());
        }
    }

    @Test
    void authorsRomanNumeralsAndRecordsTwoSteps() {
        Steps.Bound bound = Steps.bind(new RomanNumeralSteps());

        var steps = bound.registry().steps();
        assertEquals(2, steps.size(), "one action + one sensor");
        assertEquals(new RomanNumeralSteps.Ctx(null), bound.stateFactory().get(), "one state factory per step class");

        var action = steps.get(0);
        assertEquals("I convert {int} to roman numerals", action.expression());
        assertEquals(StepKind.STIMULUS, action.kind());

        var sensor = steps.get(1);
        assertEquals("The result is {word}", sensor.expression());
        assertEquals(StepKind.SENSOR, sensor.kind());

        // Full-replacement record state model: the action returns a NEW, complete Ctx.
        @SuppressWarnings("unchecked")
        var convert = (Steps.Stimulus1<RomanNumeralSteps.Ctx, Integer>) action.handler();
        assertEquals(new RomanNumeralSteps.Ctx("IX"), convert.apply(new RomanNumeralSteps.Ctx(null), 9));

        // Sensor observes state and returns the value the pure core will compare.
        @SuppressWarnings("unchecked")
        var read = (Steps.Sensor1<RomanNumeralSteps.Ctx, String, String>) sensor.handler();
        assertEquals("IX", read.apply(new RomanNumeralSteps.Ctx("IX"), "IX"));

        // Source location captured via StackWalker (analogous to co_filename/co_firstlineno).
        assertEquals("AuthorApiTest.java", action.expressionSourceFile());
        assertTrue(action.expressionSourceLine() > 0);
    }

    /** Pure steps need no evolving state: {@link Steps#defineState} is simply not called. */
    static final class SquareSteps implements StepDefinitions<State.Empty> {
        @Override
        public void register(Steps<State.Empty> s) {
            s.stimulus("I warm up my mental math", (State.Empty state) -> state);

            s.sensor(
                    "the square of {int} is {int}",
                    (State.Empty state, Integer n, Integer expected) -> List.of(n, n * n));
        }
    }

    @Test
    void omittingStateBindsHandlersToEmptyState() {
        Steps.Bound bound = Steps.bind(new SquareSteps());

        var steps = bound.registry().steps();
        assertEquals(2, steps.size(), "one stimulus + one sensor");
        assertEquals(State.Empty.INSTANCE, bound.stateFactory().get(), "the default factory still applies");

        @SuppressWarnings("unchecked")
        var warmUp = (Steps.Stimulus0<State.Empty>) steps.get(0).handler();
        assertEquals(State.Empty.INSTANCE, warmUp.apply(State.Empty.INSTANCE));

        @SuppressWarnings("unchecked")
        var square = (Steps.Sensor2<State.Empty, Integer, Integer, List<Integer>>)
                steps.get(1).handler();
        assertEquals(List.of(7, 49), square.apply(State.Empty.INSTANCE, 7, 49));
    }
}
