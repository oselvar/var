// C# sibling of basket.steps.ts (bundle 18-multi-table-example).
//
// The two Given/And paragraphs each carry a table and are separated from each other by a blank line
// (valid GFM). They must merge into ONE example that shares state, so the sensor reads back 1 user
// and 1 asset. The second example — separated by the prose paragraph — starts from a fresh, empty
// basket and reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
using System.Collections.Immutable;
using Varar;
using Varar.Core;

namespace Varar.Corpus.B18;

public static class BasketSteps
{
    public static void Register(Steps s)
    {
        // Each stimulus carries a whole table (its only slot). Under full replacement it returns the
        // next basket, preserving the field it does not touch.
        s.Stimulus("the following users have been imported", (state, rows) =>
            Value.Map([
                new("users", ImportedRows(rows)),
                new("assets", FieldOf(state, "assets")),
            ]));

        s.Stimulus("the following assets have been imported", (state, rows) =>
            Value.Map([
                new("users", FieldOf(state, "users")),
                new("assets", ImportedRows(rows)),
            ]));

        s.Sensor("the basket contains {int} user(s) and {int} asset(s)", (state, users, assets) =>
            Value.List([
                Value.Of(CountOf(state, "users")),
                Value.Of(CountOf(state, "assets")),
            ]));
    }

    public static Value State() => Value.Map([
        new("users", Value.List([])),
        new("assets", Value.List([])),
    ]);

    // A whole-table slot arrives as rows-of-cells; skip the header row and take the first cell.
    private static Value ImportedRows(Value rows) =>
        rows is VList list
            ? Value.List(list.Items.Skip(1).Select(row =>
                row is VList cells && cells.Items.Length > 0 ? cells.Items[0] : Value.Of(string.Empty)))
            : Value.List([]);

    private static Value FieldOf(Value state, string name) =>
        state is VMap m && m.Entries.TryGetValue(name, out var v) ? v : Value.List([]);

    private static long CountOf(Value state, string name) =>
        FieldOf(state, name) is VList list ? list.Items.Length : 0;
}
