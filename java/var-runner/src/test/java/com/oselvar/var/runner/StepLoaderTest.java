package com.oselvar.var.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.Registry;
import com.oselvar.var.runner.StepLoader.LoadedSteps;
import com.oselvar.var.runner.fixtures.AlphaSteps;
import com.oselvar.var.runner.fixtures.BetaSteps;
import com.oselvar.var.runner.fixtures.ContextOnlySteps;
import com.oselvar.var.runner.fixtures.DeltaSteps;
import com.oselvar.var.runner.fixtures.EpsilonSteps;
import com.oselvar.var.runner.fixtures.GammaSteps;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Confirms {@link StepLoader#loadSteps} reflectively loads real {@link
 * com.oselvar.var.StepDefinitions} classes (not mocks), merges their registries into
 * one, and builds a {@code createContext} function keyed EXACTLY the way {@link
 * com.oselvar.var.core.Execute#collectExamples} looks it up — by {@code
 * Registry.StepRegistration#expressionSourceFile()} (confirmed by reading {@code
 * Execute.runExample}, which does {@code createContext.apply(step.stepDef()
 * .expressionSourceFile())}) — with no cross-wiring between two different files' state.
 */
class StepLoaderTest {

    private static final ClassLoader LOADER = StepLoaderTest.class.getClassLoader();

    @Test
    void mergesStepsFromMultipleClassesIntoOneRegistry() {
        LoadedSteps loaded =
                StepLoader.loadSteps(List.of(AlphaSteps.class.getName(), BetaSteps.class.getName()), LOADER);

        assertEquals(4, loaded.registry().steps().size(), "2 steps/file x 2 files");
        List<String> expressions = loaded.registry().steps().stream()
                .map(Registry.StepRegistration::expression)
                .toList();
        assertTrue(expressions.contains("alpha increments to {int}"));
        assertTrue(expressions.contains("alpha count is {int}"));
        assertTrue(expressions.contains("beta sets label to {word}"));
        assertTrue(expressions.contains("beta label is {word}"));
    }

    @Test
    void expressionSourceFilesAreGenuinelyDistinctPerClass() {
        LoadedSteps loaded =
                StepLoader.loadSteps(List.of(AlphaSteps.class.getName(), BetaSteps.class.getName()), LOADER);

        List<String> files = loaded.registry().steps().stream()
                .map(Registry.StepRegistration::expressionSourceFile)
                .distinct()
                .toList();
        assertEquals(List.of("AlphaSteps.java", "BetaSteps.java"), files);
    }

    @Test
    void createContextResolvesEachFilesOwnStateFactoryWithoutCrossWiring() {
        LoadedSteps loaded =
                StepLoader.loadSteps(List.of(AlphaSteps.class.getName(), BetaSteps.class.getName()), LOADER);

        Object alphaState = loaded.createContext().apply("AlphaSteps.java");
        Object betaState = loaded.createContext().apply("BetaSteps.java");

        AlphaSteps.Ctx alpha = assertInstanceOf(AlphaSteps.Ctx.class, alphaState);
        BetaSteps.Ctx beta = assertInstanceOf(BetaSteps.Ctx.class, betaState);
        assertEquals(0, alpha.count());
        assertEquals("", beta.label());

        // Cross-wiring check: neither file's key ever produces the OTHER file's state
        // type, in either direction.
        assertThrows(ClassCastException.class, () -> {
            AlphaSteps.Ctx wrong = (AlphaSteps.Ctx) betaState;
        });
        assertThrows(ClassCastException.class, () -> {
            BetaSteps.Ctx wrong = (BetaSteps.Ctx) alphaState;
        });
    }

    @Test
    void createContextIsFreshPerCallMirroringPerFileStateFactorySemantics() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of(AlphaSteps.class.getName()), LOADER);

        Object first = loaded.createContext().apply("AlphaSteps.java");
        Object second = loaded.createContext().apply("AlphaSteps.java");
        assertEquals(first, second, "same initial value");
        assertTrue(first != second, "but a fresh instance each call, per Registrar's contract");
    }

    @Test
    void unknownFileThrowsClearly() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of(AlphaSteps.class.getName()), LOADER);
        IllegalStateException e = assertThrows(
                IllegalStateException.class, () -> loaded.createContext().apply("NoSuchFile.java"));
        assertTrue(e.getMessage().contains("NoSuchFile.java"));
    }

    @Test
    void classNotImplementingStepDefinitionsThrowsClearly() {
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class, () -> StepLoader.loadSteps(List.of("java.lang.String"), LOADER));
        assertTrue(e.getMessage().contains("java.lang.String"));
    }

    @Test
    void unknownClassNameThrowsClearly() {
        assertThrows(
                IllegalArgumentException.class,
                () -> StepLoader.loadSteps(List.of("com.oselvar.var.runner.NoSuchStepsClass"), LOADER));
    }

    @Test
    void aClassThatDefinesStateButRegistersZeroStepsIsSkippedNotCrashed() {
        LoadedSteps loaded =
                StepLoader.loadSteps(List.of(AlphaSteps.class.getName(), ContextOnlySteps.class.getName()), LOADER);

        // Only Alpha's steps are in the merged registry; the context-only class
        // contributes nothing to key by (and nothing needs it, since no step ever runs
        // from its file).
        assertEquals(2, loaded.registry().steps().size());
    }

    @Test
    void duplicateExpressionAcrossTwoClassesThrows() {
        // AlphaSteps registers "alpha increments to {int}" once already; loading it
        // twice (as if two step-definition files accidentally declared the same
        // expression) must surface addStep's existing duplicate-detection, not silently
        // merge over it.
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class,
                () -> StepLoader.loadSteps(List.of(AlphaSteps.class.getName(), AlphaSteps.class.getName()), LOADER));
        assertTrue(e.getMessage().contains("duplicate step definition"));
    }

    @Test
    void mergesCustomParameterTypesFromMultipleClassesWithDifferentNames() {
        LoadedSteps loaded =
                StepLoader.loadSteps(List.of(GammaSteps.class.getName(), DeltaSteps.class.getName()), LOADER);

        assertEquals(2, loaded.registry().customParameterTypes().size());
        var customTypes = loaded.registry().customParameterTypes();
        assertEquals("color", customTypes.get(0).name());
        assertEquals("size", customTypes.get(1).name());
    }

    @Test
    void duplicateCustomParameterTypeNameAcrossTwoClassesThrows() {
        // GammaSteps and EpsilonSteps both register a "color" parameter type; loading
        // both (as if two step-definition files accidentally declared the same custom
        // parameter-type name) must reject it.
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class,
                () -> StepLoader.loadSteps(List.of(GammaSteps.class.getName(), EpsilonSteps.class.getName()), LOADER));
        assertTrue(e.getMessage().contains("duplicate custom parameter-type name \"color\""));
    }
}
