package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * A standalone (top-level, own-file) {@link StepDefinitions} fixture for {@code
 * StepLoaderTest} — mirrors what a real {@code *.md} spec's own step-definition file
 * would look like. Deliberately a top-level class (not nested inside the test class)
 * so its {@code RegistryRegistrar}-captured {@code expressionSourceFile} is genuinely
 * {@code "AlphaSteps.java"}, distinct from {@link BetaSteps}' {@code "BetaSteps.java"}
 * — a nested test class would collapse both to the enclosing test file's name (see
 * {@code RegistryRegistrarTest}, whose nested {@code RomanNumeralSteps} fixture reports
 * {@code "RegistryRegistrarTest.java"}), which would defeat the point of this test:
 * proving {@link dev.varar.runner.StepLoader}'s per-file context-key resolution
 * doesn't cross-wire two different files' state.
 */
public final class AlphaSteps implements StepDefinitions<AlphaSteps.Ctx> {

    public record Ctx(int count) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0));
        s.stimulus("alpha increments to {int}", (Ctx ctx, Integer n) -> new Ctx(n));
        s.sensor("alpha count is {int}", (Ctx ctx, Integer expected) -> ctx.count());
    }
}
