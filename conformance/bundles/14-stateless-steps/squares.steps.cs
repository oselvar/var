// C# sibling of squares.steps.ts / .rs (bundle 14-stateless-steps).
// Pure steps — nothing to arrange or evolve — so State() is a bare Null every handler ignores.
using Varar;
using Varar.Core;

namespace Varar.Corpus.B14;

public static class SquaresSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Stimulus("I warm up my mental math", state => null);

        // Two slots ({int}, {int}); the handler uses only the first and returns both computed
        // columns [n, n*n] for positional comparison.
        s.Sensor("The square of {int} is {int}.", (state, n, square) =>
        {
            var value = n.AsInt();
            return Value.List([Value.Of(value), Value.Of(value * value)]);
        });

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
