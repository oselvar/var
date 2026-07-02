package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class StepLoaderStaticFactoryTest {

    private static final ClassLoader LOADER = StepLoaderStaticFactoryTest.class.getClassLoader();

    @Test
    void loadsAClassExposingAStaticStepDefinitionsFactory() {
        StepLoader.LoadedSteps loaded =
                StepLoader.loadSteps(
                        List.of("com.oselvar.var.runner.StaticFactorySteps"), LOADER);

        assertEquals(1, loaded.registry().steps().size());
        assertEquals(
                "I do a static-factory thing",
                loaded.registry().steps().get(0).expression());
        // The load unit's state factory is keyed by the fixture's source file.
        assertNotNull(loaded.createContext().apply("StaticFactorySteps.java"));
    }

    @Test
    void rejectsAClassThatIsNeitherImplementorNorFactory() {
        IllegalArgumentException e =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> StepLoader.loadSteps(List.of("java.lang.String"), LOADER));
        assertTrue(e.getMessage().contains("StepDefinitions"), e.getMessage());
        assertTrue(e.getMessage().contains("static"), e.getMessage());
    }

    @Test
    void rejectsTwoDefineStateRegistrationsSharingOneSourceFile() {
        IllegalArgumentException e =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                StepLoader.loadSteps(
                                        List.of("com.oselvar.var.runner.DuplicateStateSteps"), LOADER));
        assertTrue(e.getMessage().contains("DuplicateStateSteps.java"), e.getMessage());
        assertTrue(e.getMessage().contains("one defineState"), e.getMessage());
    }
}
