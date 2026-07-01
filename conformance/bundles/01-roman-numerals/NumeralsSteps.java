package com.oselvar.var.conformance.bundle01;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Map;

/**
 * Java sibling of {@code numerals.steps.ts} / {@code numerals.steps.py} (bundle
 * {@code 01-roman-numerals}). See {@code java/var/src/test/java/com/oselvar/var/
 * AuthorApiTest.java}'s {@code RomanNumeralSteps} for the hand-authored prototype this
 * fixture is adapted from — this is the real, conformance-harness-loaded copy.
 *
 * <p>Fixture-layout note (Task 13): this file lives under the language-neutral
 * conformance corpus (a sibling of every {@code *.steps.ts}/{@code *.steps.py} in this
 * directory), not under {@code var}'s {@code src/}. It reaches the test compile
 * classpath via {@code build-helper-maven-plugin}'s {@code add-test-source} goal
 * configured in {@code java/var/pom.xml}, which adds {@code conformance/bundles}
 * as an additional test-source root — Maven's compiler plugin does not require a
 * source file's directory to match its package declaration, only that the directory be
 * a configured source root.
 */
public final class NumeralsSteps implements StepDefinitions {

    record Ctx(String result) implements State {}

    private static final Map<Integer, String> ROMAN = Map.of(1, "I", 4, "IV", 9, "IX", 40, "XL");

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(null));

        s.action(
                "I convert {int} to roman numerals",
                (Ctx ctx, Integer n) -> new Ctx(ROMAN.get(n)));

        s.sensor(
                "The result is {word}",
                (Ctx ctx, String expected) -> {
                    // {word} greedily captures trailing sentence punctuation when it's not
                    // separated by whitespace (the source reads "The result is I." — the
                    // captured word is "I.", not "I"; confirmed against golden/plan.json's
                    // args[0].value). Mirrors numerals.steps.ts's identical cleanup, which
                    // strips it before comparing, then throws directly rather than
                    // returning a value for the generic "compare against the last captured
                    // param" convenience to check (that convenience compares the RAW
                    // captured source text, punctuation and all, which would wrongly fail
                    // here) — returning null opts out of it, matching TS's sensor, which
                    // never returns from this handler either.
                    String cleaned = expected.replaceAll("[.!?]$", "");
                    if (!cleaned.equals(ctx.result())) {
                        throw new AssertionError("expected " + cleaned + " but got " + ctx.result());
                    }
                    return null;
                });
    }
}
