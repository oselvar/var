// C# sibling of division.steps.ts / .rs (bundle 03-expected-failure).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B03;

public static class DivisionSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Stimulus("I divide {int} by {int}", (state, a, b) =>
        {
            var divisor = b is VInt i ? i.Int : 0;
            if (divisor == 0)
            {
                throw new HandlerException("division by zero");
            }

            return state;
        });

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
