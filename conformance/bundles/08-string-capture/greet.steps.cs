// C# sibling of greet.steps.ts / .rs (bundle 08-string-capture).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B08;

public static class GreetSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Stimulus("I greet {string}", (state, name) => null);

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
