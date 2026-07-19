using Varar;
using Varar.Core;
using static Varar.Example.StepHelpers;

namespace Varar.Example;

public static class TablesAndDocstringsSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // A whole table is handed to the step; it returns the computed rows and Vár checks each cell.
        s.Sensor("Uppercase each one:", (state, table) =>
        {
            var rows = ((VList)table).Items;
            var computed = rows.Skip(1).Select(row =>
            {
                var before = AsStr(((VList)row).Items[0]);
                return VMap(("before", Value.Of(before)), ("after", Value.Of(before.ToUpperInvariant())));
            });
            return Value.List(computed);
        });

        // Two slots: the {word} and the trailing doc string; the return is [word, produced text].
        s.Sensor("Greet {word}:", (state, name, doc) =>
        {
            var n = name.AsString();
            return Value.List([Value.Of(n), Value.Of($"Hello, {n}!\n")]);
        });

        return s.ToRegistry();
    }
}
