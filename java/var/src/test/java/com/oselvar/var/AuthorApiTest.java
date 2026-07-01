package com.oselvar.var;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.StepKind;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Proves the chosen author API (Task 11, Candidate B) can express the {@code
 * 01-roman-numerals} conformance bundle naturally and that its full-replacement record
 * state model round-trips. This is the Java sibling of {@code numerals.steps.ts} /
 * {@code numerals.steps.py}.
 */
class AuthorApiTest {

    /** Roman-numerals authored against the winning API shape. */
    static final class RomanNumeralSteps implements StepDefinitions {
        record Ctx(String result) implements State {}

        static final Map<Integer, String> ROMAN = Map.of(1, "I", 4, "IV", 9, "IX", 40, "XL");

        @Override
        public void defineSteps(Registrar registrar) {
            StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(null));

            s.action(
                    "I convert {int} to roman numerals",
                    (Ctx ctx, Integer n) -> new Ctx(ROMAN.get(n)));

            s.sensor("The result is {word}", (Ctx ctx, String expected) -> ctx.result());
        }
    }

    @Test
    void authorsRomanNumeralsAndRecordsTwoSteps() {
        RecordingRegistrar registrar = new RecordingRegistrar();
        new RomanNumeralSteps().defineSteps(registrar);

        var steps = registrar.steps();
        assertEquals(2, steps.size(), "one action + one sensor");
        assertEquals(1, registrar.factories().size(), "one state factory per step class");

        var action = steps.get(0);
        assertEquals("I convert {int} to roman numerals", action.expression());
        assertEquals(StepKind.ACTION, action.kind());

        var sensor = steps.get(1);
        assertEquals("The result is {word}", sensor.expression());
        assertEquals(StepKind.SENSOR, sensor.kind());

        // Full-replacement record state model: the action returns a NEW, complete Ctx.
        @SuppressWarnings("unchecked")
        var convert =
                (StateBinder.Context1<RomanNumeralSteps.Ctx, Integer>) action.handler();
        assertEquals(
                new RomanNumeralSteps.Ctx("IX"),
                convert.apply(new RomanNumeralSteps.Ctx(null), 9));

        // Sensor observes state and returns the value the pure core will compare.
        @SuppressWarnings("unchecked")
        var read =
                (StateBinder.Sensor1<RomanNumeralSteps.Ctx, String, String>) sensor.handler();
        assertEquals("IX", read.apply(new RomanNumeralSteps.Ctx("IX"), "IX"));

        // Source location captured via StackWalker (analogous to co_filename/co_firstlineno).
        assertEquals("AuthorApiTest.java", action.sourceFile());
        assertTrue(action.sourceLine() > 0);
    }
}
