using System.Runtime.CompilerServices;
using Varar;
using Varar.Core;
using Xunit;

namespace Varar.Tests;

// A fixture written the way a conformance *.steps.cs file is: a static
// void Register(Steps) that folds its definitions into the injected builder.
internal static class CounterSteps
{
    public static void Register(Steps s)
    {
        s.State(() => Value.Map([new("count", Value.Of(0))]));
        s.Stimulus("I increment", state => Value.Map([new("count", Value.Of(state["count"].AsInt() + 1))]));
        s.Sensor("The count is {int}", (state, n) => state["count"]);
    }
}

public class StepsTests
{
    // Mirror the runner's loader: hand the fixture a builder, read back the registry.
    private static Registry BuildCounter()
    {
        var s = Steps.From(Registry.Create());
        CounterSteps.Register(s);
        return s.ToRegistry();
    }

    [Fact]
    public void RegisterFoldsStimuliAndSensorsIntoTheRegistryInOrder()
    {
        var r = BuildCounter();

        Assert.Equal(2, r.Steps.Length);
        Assert.Equal("I increment", r.Steps[0].Expression);
        Assert.Equal(StepKind.Stimulus, r.Steps[0].Kind);
        Assert.Equal("The count is {int}", r.Steps[1].Expression);
        Assert.Equal(StepKind.Sensor, r.Steps[1].Kind);
    }

    [Fact]
    public void StateRecordsAFactoryKeyedByTheCallerFileThatProducesTheInitialState()
    {
        var r = BuildCounter();

        var factory = Assert.Single(r.ContextFactories).Value;
        Assert.Equal(Value.Map([new("count", Value.Of(0))]), factory());
    }

    [Fact]
    public void FullReplacementStimulusReturnsTheWholeNextState()
    {
        var r = BuildCounter();
        var start = Assert.Single(r.ContextFactories).Value();

        // Invoke the stored stimulus handler directly (execution wiring is T6).
        var next = (Value?)r.Steps[0].Handler(start, []);

        Assert.Equal(Value.Map([new("count", Value.Of(1))]), next);
    }

    [Fact]
    public void SensorHandlerReadsStateAndReturnsAComparisonValue()
    {
        var r = BuildCounter();
        var state = Value.Map([new("count", Value.Of(5))]);

        var observed = (Value?)r.Steps[1].Handler(state, [Value.Of(5)]);

        Assert.Equal(Value.Of(5), observed);
    }

    [Fact]
    public void CallerFilePathCapturesThisFixtureFilesStem()
    {
        var r = Steps.From(Registry.Create())
            .Stimulus("noop", _ => null)
            .ToRegistry();

        var stem = Path.GetFileNameWithoutExtension(r.Steps[0].ExpressionSourceFile);
        Assert.Equal("StepsTests", stem);
        Assert.True(r.Steps[0].ExpressionSourceLine > 0);
    }

    [Fact]
    public void ParamDeclaresACustomTypeUsableInLaterExpressions()
    {
        var r = Steps.From(Registry.Create())
            .Param("airport", "[A-Z]{3}", g => Value.Of(g[0]!.ToLowerInvariant()))
            .Sensor("I fly to {airport}", (state, a) => a)
            .ToRegistry();

        Assert.Equal("airport", Assert.Single(r.CustomParameterTypes).Name);
        Assert.Equal("I fly to {airport}", r.Steps[0].Expression);
    }
}
