using System.Globalization;
using Varar;
using Varar.Core;
using static Varar.Example.StepHelpers;

namespace Varar.Example;

public static class RomanNumeralsSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // Header-bound: the paragraph names the table's columns, so the step runs once per row,
        // returning the columns it computes; Vár diffs them against the row cells.
        s.Sensor("a decimal and a roman number", (state, row) =>
        {
            var value = AsStr(SMap(row)["decimal"]);
            var roman = RomanNumerals.ToRoman(int.Parse(value, CultureInfo.InvariantCulture));
            return VMap(("decimal", Value.Of(value)), ("roman", Value.Of(roman)));
        });

        return s.ToRegistry();
    }
}
