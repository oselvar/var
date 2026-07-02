package com.oselvar.var.conformance.bundle13;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Java sibling of {@code airports.steps.ts}/{@code airports.steps.py}/{@code
 * airports.steps.kt} (bundle {@code 13-custom-parameter-type}) — the first fixture
 * exercising {@link Registrar#defineParameterType}: a custom {@code {airport}} type
 * (IATA code, lowercased by the transformer). The lowercasing is asserted by the
 * sensor (the .md says "lhr"), so an identity transformer fails this bundle. The
 * parameter type MUST be registered before the steps — expressions compile eagerly.
 */
public final class AirportsSteps implements StepDefinitions {

    record Ctx(String dest) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        registrar.defineParameterType(
                "airport",
                Pattern.compile("[A-Z]{3}"),
                groups -> groups[0].toLowerCase(Locale.ROOT));

        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(null));

        s.action("I fly to {airport}", (Ctx ctx, String dest) -> new Ctx(dest));

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
