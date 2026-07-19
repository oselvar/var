using System.Globalization;
using Varar;
using Varar.Core;
using static Varar.Example.StepHelpers;

namespace Varar.Example;

public static class YahtzeeSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // Header-bound: dice and category are inputs, score is the computed column Vár checks.
        s.Sensor("Examples of dice, category and score", (state, row) =>
        {
            var m = SMap(row);
            var dice = AsStr(m["dice"]).Split(',').Select(d => int.Parse(d.Trim(), CultureInfo.InvariantCulture)).ToList();
            var category = AsStr(m["category"]);
            return VMap(("score", Value.Of(Yahtzee.Score(dice, category))));
        });

        return s.ToRegistry();
    }
}
