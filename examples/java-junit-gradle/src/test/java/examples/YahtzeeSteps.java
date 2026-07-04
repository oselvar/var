package examples;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public final class YahtzeeSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        // Header-bound table: the paragraph names every header cell (dice,
        // category, score), so this sensor runs once per row with the row as a
        // Map keyed by header. Returning Map.of("score", …) checks that column;
        // the other columns are inputs.
        s.sensor("Examples of dice, category and score", (Ctx ctx, Map<String, String> row) -> {
            List<Integer> dice = Arrays.stream(row.get("dice").split(","))
                    .map(d -> Integer.parseInt(d.trim()))
                    .toList();
            return Map.of("score", Yahtzee.score(dice, row.get("category")));
        });
    }
}
