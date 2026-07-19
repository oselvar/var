// C# sibling of echo.steps.ts / .rs (bundle 04-tables-and-docstrings).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B04;

public static class EchoSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // The doc string is this sensor's only slot, so it is returned bare; the core compares it
        // against the input (equal passes).
        s.Sensor("I echo the following:", (state, doc) => doc);

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
