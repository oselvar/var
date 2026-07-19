// C# sibling of money.steps.ts / .rs (bundle 15-custom-parameter-format).
// Money is encoded as a bare Float (pounds); format renders it back in document notation, so the
// pinned mismatch reads £2.60 / £2.55.
using System.Globalization;
using Varar;
using Varar.Core;

namespace Varar.Corpus.B15;

public static class MoneySteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Param(
            "money",
            @"£\d+\.\d{2}",
            g =>
            {
                var raw = g[0]!;
                var body = raw.StartsWith("£", StringComparison.Ordinal) ? raw.Substring(1) : raw;
                return Value.Of(double.TryParse(body, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0.0);
            },
            v => v is VFloat f ? "£" + f.Float.ToString("F2", CultureInfo.InvariantCulture) : v.ToString()!);

        // Returns the WRONG money on purpose; the golden pins the formatted actual "£2.60", proving
        // mismatches render through format.
        s.Sensor("The late fee is {money}", (state, expected) => Value.Of(2.6));

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
