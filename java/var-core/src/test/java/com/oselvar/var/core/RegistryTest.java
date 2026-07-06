package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.cucumber.cucumberexpressions.Argument;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/registry.test.ts}. */
class RegistryTest {

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    @Test
    void createRegistryReturnsAnEmptyRegistryWithDefaultParameterTypes() {
        Registry r = Registry.createRegistry();
        assertEquals(0, r.steps().size());
        assertNotNull(r.parameterTypes());
    }

    @Test
    void addStepReturnsANewRegistryOriginalIsUnchanged() {
        Registry r0 = Registry.createRegistry();
        Registry r1 = Registry.addStep(r0, "I have {int} cukes", "steps.ts", 1, NOOP_HANDLER, null);

        assertEquals(0, r0.steps().size());
        assertEquals(1, r1.steps().size());
        assertEquals("I have {int} cukes", r1.steps().get(0).expression());
    }

    @Test
    void defineParameterTypeMakesACustomTypeAvailableToSubsequentStepCompilations() {
        Registry r = Registry.createRegistry();
        Registry withType =
                Registry.defineParameterType(r, "airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0]);

        // Compiling an expression that uses {airport} should now succeed without an
        // UndefinedParameterTypeError.
        assertDoesNotThrow(() -> Registry.addStep(withType, "I fly to {airport}", "steps.ts", 1, NOOP_HANDLER, null));
    }

    @Test
    void defineParameterTypeReturnedStepActuallyMatchesTheRegexAtRuntime() {
        Registry r = Registry.createRegistry();
        r = Registry.defineParameterType(r, "airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0].toLowerCase());
        r = Registry.addStep(r, "I fly to {airport}", "steps.ts", 1, NOOP_HANDLER, null);

        Optional<List<Argument<?>>> match = r.steps().get(0).compiled().match("I fly to LHR");
        assertTrue(match.isPresent());
        assertEquals("lhr", match.get().get(0).getValue());
    }

    @Test
    void addStepThrowsOnDuplicateExpressionsListingBothSourcePositions() {
        Registry r = Registry.createRegistry();
        Registry withFirst = Registry.addStep(r, "I have {int} cukes", "a.ts", 3, NOOP_HANDLER, null);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> Registry.addStep(withFirst, "I have {int} cukes", "b.ts", 9, NOOP_HANDLER, null));
        assertTrue(ex.getMessage().matches("(?s).*duplicate step definition.*a\\.ts:3.*b\\.ts:9.*"));
    }

    @Test
    void addStepCarriesTheStepKindThroughToTheRegistration() {
        Registry r = Registry.addStep(
                Registry.createRegistry(), "I greet {string}", "a.steps.ts", 1, NOOP_HANDLER, StepKind.SENSOR);
        assertEquals(StepKind.SENSOR, r.steps().get(0).kind());
    }

    @Test
    void kindIsOptionalLegacyStepPath() {
        Registry r =
                Registry.addStep(Registry.createRegistry(), "I greet {string}", "a.steps.ts", 1, NOOP_HANDLER, null);
        assertNull(r.steps().get(0).kind());
    }

    @Test
    void defineParameterTypeRecordsTheCustomTypeImmutably() {
        Registry r0 = Registry.createRegistry();
        assertEquals(List.of(), r0.customParameterTypes());
        Registry r1 =
                Registry.defineParameterType(r0, "airport", java.util.regex.Pattern.compile("[A-Z]{3}"), g -> g[0]);
        assertEquals(List.of(new Registry.CustomParameterType("airport", "[A-Z]{3}")), r1.customParameterTypes());
        // The original registry value is untouched (records are immutable views).
        assertEquals(List.of(), r0.customParameterTypes());
        assertThrows(
                UnsupportedOperationException.class,
                () -> r1.customParameterTypes().add(new Registry.CustomParameterType("x", "y")));
    }
}
