// C# sibling of boom.steps.ts / .rs (bundle 09-expected-message-mismatch).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B09;

public static class BoomSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // Throws a message that does NOT contain the expected substring "expected message", so the
        // expected-failure is NOT satisfied → the example fails.
        s.Stimulus("I always boom", state => throw new HandlerException("actual different error"));

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
