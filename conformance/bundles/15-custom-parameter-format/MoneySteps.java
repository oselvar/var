package com.oselvar.var.conformance.bundle15;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Java sibling of {@code money.steps.ts}/{@code money.steps.py}/{@code money.steps.kt}
 * (bundle {@code 15-custom-parameter-format}) — a custom {@code {money}} parameter type
 * with a {@code format}: the inverse of {@code parse}, rendering a value back in the
 * document's notation. The sensor returns the WRONG Money on purpose: the golden pins
 * the formatted actual ({@code "£2.60"}), proving every port renders parameter
 * mismatches through {@code format} identically. Without a format this actual would be
 * each port's native object rendering, which is deliberately outside conformance.
 */
public final class MoneySteps implements StepDefinitions {

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<State.Empty> s = registrar.steps();

        StateBinder.Parse<Map<String, Object>> parse =
                groups -> Map.of("currency", "GBP", "value", Double.parseDouble(groups[0].substring(1)));
        Function<Map<String, Object>, String> format = m -> String.format(Locale.ROOT, "£%.2f", m.get("value"));
        s.param("money", Pattern.compile("£\\d+\\.\\d{2}"), parse, format);

        s.sensor(
                "The late fee is {money}",
                (State.Empty state, Map<String, Object> fee) -> Map.of("currency", "GBP", "value", 2.6));
    }
}
