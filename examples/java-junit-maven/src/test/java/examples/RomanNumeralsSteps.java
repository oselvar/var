package examples;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Map;

public final class RomanNumeralsSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.sensor("a decimal and a roman number", (Ctx ctx, Map<String, String> row) -> Map.of(
                "decimal", row.get("decimal"),
                "roman", RomanNumerals.toRoman(Integer.parseInt(row.get("decimal")))));
    }
}
