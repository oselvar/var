package dev.varar.conformance.bundle18;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.ArrayList;
import java.util.List;

/**
 * Java sibling of {@code basket.steps.ts} (bundle {@code 18-multi-table-example}).
 *
 * <p>The two Given/And paragraphs each carry a table and are separated from each other by a blank
 * line (valid GFM). They must merge into ONE example that shares state, so the sensor reads back 1
 * user and 1 asset. The second example — separated by the prose paragraph — starts from a fresh,
 * empty basket and reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
 *
 * <p>Each whole-table slot arrives as rows-of-cells including the header row, so {@link
 * #firstColumn} skips row 0 and takes the first cell of every data row.
 */
public final class BasketSteps implements StepDefinitions<BasketSteps.Basket> {

    record Basket(List<String> users, List<String> assets) implements State {}

    @Override
    public void register(Steps<Basket> s) {
        s.state(() -> new Basket(List.of(), List.of()));

        s.stimulus(
                "the following users have been imported",
                (Basket b, List<List<String>> rows) -> new Basket(firstColumn(rows), b.assets()));

        s.stimulus(
                "the following assets have been imported",
                (Basket b, List<List<String>> rows) -> new Basket(b.users(), firstColumn(rows)));

        s.sensor(
                "the basket contains {int} user(s) and {int} asset(s)",
                (Basket b, Integer users, Integer assets) ->
                        List.of(b.users().size(), b.assets().size()));
    }

    private static List<String> firstColumn(List<List<String>> rows) {
        List<String> out = new ArrayList<>();
        for (List<String> row : rows.subList(1, rows.size())) {
            out.add(row.isEmpty() ? "" : row.get(0));
        }
        return out;
    }
}
