package dev.varar.runner.fixtures;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * A small standalone (top-level, own-file) {@link StepDefinitions} fixture for {@code
 * RunTest} — registers one {@code context} step that sets a widget count and one {@code
 * sensor} step that reports it, so a real spec can be planned and run end to end
 * through {@link dev.varar.runner.Run#examplesWithRuns}. Deliberately its own
 * top-level file (see {@code AlphaSteps}' javadoc for why: {@code RegistryRegistrar}'s
 * {@code StackWalker}-captured {@code expressionSourceFile} must be this file's own
 * name, not the enclosing test class's).
 */
public final class WidgetSteps implements StepDefinitions<WidgetSteps.Ctx> {

    public record Ctx(int count) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0));
        s.stimulus("I have {int} widgets", (Ctx ctx, Integer n) -> new Ctx(n));
        s.sensor("I should have {int} widgets", (Ctx ctx, Integer expected) -> ctx.count());
    }
}
