package dev.varar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.Registry;
import dev.varar.core.StepKind;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Proves the REAL {@link Steps} — {@link Steps}, not the {@code
 * RecordingRegistrar} test double {@link AuthorApiTest} uses to pin the author-API shape
 * — actually builds a var-core {@link Registry} via {@link Registry#addStep}: correct
 * {@link StepKind}, source location captured via {@code StackWalker}, and a genuinely
 * compiled, working cucumber expression (not just a recorded string).
 */
class StepsTest {

    /** Same authoring as {@link AuthorApiTest}'s roman-numerals fixture. */
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
    void buildsARealRegistryFromContextActionSensorRegistrations() {
        Steps.Bound bound = Steps.bind(new RomanNumeralSteps());

        Registry registry = bound.registry();
        assertEquals(2, registry.steps().size(), "one action + one sensor");
        assertNotNull(bound.stateFactory(), "one state factory per step class");

        var action = registry.steps().get(0);
        assertEquals("I convert {int} to roman numerals", action.expression());
        assertEquals(StepKind.STIMULUS, action.kind());
        assertEquals("StepsTest.java", action.expressionSourceFile());
        assertTrue(action.expressionSourceLine() > 0);

        var sensor = registry.steps().get(1);
        assertEquals("The result is {word}", sensor.expression());
        assertEquals(StepKind.SENSOR, sensor.kind());

        // The compiled expression is genuinely working (an actual cucumber-expressions
        // Expression), not just a recorded string: it matches real input and extracts
        // the typed capture.
        var match = action.compiled().match("I convert 9 to roman numerals");
        assertTrue(match.isPresent());
        assertEquals(9, match.get().get(0).getValue());
    }

    @Test
    void duplicateExpressionRegisteredTwiceInOneRunThrows() {
        record Empty() implements State {}
        Steps<Empty> s = new Steps<>();
        s.state(Empty::new);
        s.stimulus("I do a thing", (Empty state) -> state);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> s.sensor("I do a thing", (Empty state) -> "x"));
        assertTrue(ex.getMessage().contains("duplicate step definition"));
    }

    @Test
    void paramWiresARealCustomTypeThroughToTheRegistry() {
        record Empty() implements State {}
        Steps<Empty> s = new Steps<>();
        s.state(Empty::new);
        s.param("airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0].toLowerCase());
        s.sensor("I fly to {airport}", (Empty state, String code) -> code);

        var step = s.registry().steps().get(0);
        var match = step.compiled().match("I fly to LHR");
        assertTrue(match.isPresent());
        assertEquals("lhr", match.get().get(0).getValue());
    }
}
