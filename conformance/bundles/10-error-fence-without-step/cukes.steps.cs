// C# sibling of cukes.steps.ts / .rs (bundle 10-error-fence-without-step).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B10;

public static class CukesSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // The prose matches no step, so the `error` fence has nothing to run → diagnostic, and the
        // example is dropped. This step exists only so the registry matches the other ports'.
        s.Stimulus("I have {int} cukes", (state, n) => null);

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
