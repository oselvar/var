// C# sibling of counter.steps.ts / .rs (bundle 02-context-isolation).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B02;

public static class CounterSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        s.Stimulus("I increment", state => Value.Map([new("count", Value.Of(CountOf(state) + 1))]));

        s.Sensor("The count is {int}", (state, n) =>
        {
            var count = CountOf(state);
            var expected = n is VInt i ? i.Int : 0;
            if (count != expected)
            {
                throw new HandlerException($"expected {expected} but got {count}");
            }

            return null;
        });

        return s.ToRegistry();
    }

    public static Value State() => Value.Map([new("count", Value.Of(0))]);

    private static long CountOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("count", out var v) && v is VInt i ? i.Int : 0;
}
