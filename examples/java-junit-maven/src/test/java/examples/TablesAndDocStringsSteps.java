package examples;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class TablesAndDocStringsSteps implements StepDefinitions<TablesAndDocStringsSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor("Uppercase each one:", (Ctx ctx, List<List<String>> rows) -> {
            List<Map<String, String>> out = new ArrayList<>();
            for (List<String> row : rows.subList(1, rows.size())) {
                out.add(Map.of("before", row.get(0), "after", row.get(0).toUpperCase(Locale.ROOT)));
            }
            return out;
        });

        s.sensor("Greet {word}:", (Ctx ctx, String name, String doc) -> List.of(name, "Hello, " + name + "!\n"));
    }
}
