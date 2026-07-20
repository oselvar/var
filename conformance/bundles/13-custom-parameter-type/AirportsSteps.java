package dev.varar.conformance.bundle13;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Java sibling of {@code airports.steps.ts}/{@code airports.steps.py}/{@code
 * airports.steps.kt} (bundle {@code 13-custom-parameter-type}) — the first fixture
 * exercising {@link Steps#param}: a custom {@code {airport}} type
 * (IATA code, lowercased by the parse function). The lowercasing is asserted by the
 * sensor (the .md says "lhr"), so an identity parse fails this bundle. The
 * parameter type MUST be registered before the steps — expressions compile eagerly.
 */
public final class AirportsSteps implements StepDefinitions<AirportsSteps.Ctx> {

    record Ctx(String dest) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(null));

        s.param("airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0].toLowerCase(Locale.ROOT));

        s.stimulus("I fly to {airport}", (Ctx ctx, String dest) -> new Ctx(dest));

        s.sensor(
                "The destination code is {word}",
                (Ctx ctx, String expected) -> {
                    // {word} greedily captures the sentence-ending period (same
                    // cleanup as bundle 01) — strip it before comparing.
                    String cleaned = expected.replaceAll("[.!?]$", "");
                    if (!cleaned.equals(ctx.dest())) {
                        throw new AssertionError("expected " + cleaned + " but got " + ctx.dest());
                    }
                    return null;
                });
    }
}
