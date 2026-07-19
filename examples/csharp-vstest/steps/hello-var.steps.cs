using Varar;
using Varar.Core;
using static Varar.Example.StepHelpers;

namespace Varar.Example;

public static class HelloVarSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);
        s.DefineState(() => VMap(("greeting", Value.Of("")), ("result", Value.Of(0))));

        s.Stimulus("I greet {string}", (state, name) =>
            new VMap(SMap(state).SetItem("greeting", Value.Of($"Hello, {name.AsString()}!"))));

        s.Sensor("the greeting should be {string}", (state, expected) => state["greeting"]);

        s.Stimulus("expression `{int}+{int}`", (state, a, b) =>
            new VMap(SMap(state).SetItem("result", Value.Of(a.AsInt() + b.AsInt()))));

        s.Sensor("evaluate to `{int}`", (state, expected) => state["result"]);

        return s.ToRegistry();
    }
}
