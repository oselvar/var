using Varar;
using Varar.Core;

namespace Varar.Example;

public static class DeepThoughtSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);
        s.Sensor("life, the universe and everything is {int}", (state, answer) => Value.Of(42));
        return s.ToRegistry();
    }
}
