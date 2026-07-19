// C# sibling of echo.steps.ts / .rs (bundle 06-doc-string-mismatch).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B06;

public static class EchoSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // Returns the WRONG string (bare — the doc string is the only slot); the core compares it to
        // the doc string and throws DocStringMismatchError.
        s.Sensor("I echo the following:", (state, doc) => Value.Of("goodbye"));

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
