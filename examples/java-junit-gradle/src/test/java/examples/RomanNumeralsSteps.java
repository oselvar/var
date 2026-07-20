package examples;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.Map;

public final class RomanNumeralsSteps implements StepDefinitions<RomanNumeralsSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor(
                "a decimal and a roman number",
                (Ctx ctx, Map<String, String> row) -> Map.of(
                        "decimal", row.get("decimal"),
                        "roman", RomanNumerals.toRoman(Integer.parseInt(row.get("decimal")))));
    }
}
