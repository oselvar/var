package examples;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class TablesAndDocStringsSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        // Whole-table mode: the table arrives as List<List<String>> (header row
        // first). It is this sensor's only slot, so return the reproduced table
        // bare — Vár compares every cell.
        s.sensor("Uppercase each one:", (Ctx ctx, List<List<String>> rows) -> {
            List<Map<String, String>> out = new ArrayList<>();
            for (List<String> row : rows.subList(1, rows.size())) {
                out.add(Map.of("before", row.get(0), "after", row.get(0).toUpperCase(Locale.ROOT)));
            }
            return out;
        });

        // Doc-string mode: two slots ({word} plus the trailing doc string), so
        // return one element per slot.
        s.sensor("Greet {word}:", (Ctx ctx, String name, String doc) -> List.of(name, "Hello, " + name + "!\n"));
    }
}
