// C# sibling of greet.steps.ts / .rs (bundle 12-combining-marks).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B12;

public static class GreetSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Sensor("I greet {string}", (state, name) => null);

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
