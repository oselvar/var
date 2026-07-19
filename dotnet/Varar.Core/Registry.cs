using System.Collections.Immutable;
using CucumberExpressions;

namespace Varar.Core;

/// <summary>
/// A step handler: receives the current immutable state plus the arguments captured from
/// the expression, and returns the next state (stimulus) or a value to compare (sensor).
/// The core treats the return as opaque; the executor (T6) interprets it.
/// </summary>
public delegate object? StepHandler(Value state, IReadOnlyList<Value> arguments);

/// <summary>One registered step definition. Port of <c>StepRegistration</c> in registry.ts.</summary>
public sealed record StepRegistration(
    string Expression,
    string ExpressionSourceFile,
    int ExpressionSourceLine,
    StepHandler Handler,
    CucumberExpression Compiled,
    StepKind? Kind);

/// <summary>A step registration without the compiled expression (<c>addStep</c> compiles it).</summary>
public sealed record StepInput(
    string Expression,
    string ExpressionSourceFile,
    int ExpressionSourceLine,
    StepHandler Handler,
    StepKind? Kind = null);

/// <summary>A custom parameter type projected to the <c>{name, regexp}</c> conformance wire shape.</summary>
public sealed record CustomParameterType(string Name, string Regexp);

/// <summary>Input to <see cref="Registry.DefineParameterType"/> (mirrors <c>ParameterTypeInput</c>).</summary>
public sealed record ParameterTypeInput(
    string Name,
    string Regexp,
    ParameterTransform? Parse = null,
    ParameterFormat? Format = null,
    bool UseForSnippets = true);

/// <summary>Produces a fresh initial state for one step file (a fresh context per example).</summary>
public delegate Value ContextFactory();

/// <summary>
/// The immutable step/parameter-type registry. Port of <c>registry.ts</c>. <see cref="ParameterTypes"/>
/// is a shared-mutable cucumber registry (as in the reference); <see cref="Steps"/>,
/// <see cref="CustomParameterTypes"/>, <see cref="Formats"/>, and <see cref="ContextFactories"/>
/// are copied on each update.
/// <para>
/// <see cref="ContextFactories"/> (keyed by the step file's caller path) carries what the
/// TypeScript facade keeps in its module-scope <c>contextFactoriesByFile</c> — threaded through
/// the registry here because the .NET port uses the injected-Registrar model (no globals).
/// </para>
/// </summary>
public sealed record Registry(
    ImmutableArray<StepRegistration> Steps,
    ParameterTypeRegistry ParameterTypes,
    ImmutableArray<CustomParameterType> CustomParameterTypes,
    ImmutableDictionary<string, ParameterFormat> Formats,
    ImmutableDictionary<string, ContextFactory> ContextFactories)
{
    public static Registry Create() => new(
        ImmutableArray<StepRegistration>.Empty,
        ParameterTypeRegistry.CreateDefault(),
        ImmutableArray<CustomParameterType>.Empty,
        ImmutableDictionary<string, ParameterFormat>.Empty,
        ImmutableDictionary<string, ContextFactory>.Empty);

    /// <summary>Records the initial-state factory for one step file (keyed by its caller path).</summary>
    public Registry WithContextFactory(string stepFile, ContextFactory factory) =>
        this with { ContextFactories = ContextFactories.SetItem(stepFile, factory) };

    public static Registry AddStep(Registry registry, StepInput input)
    {
        var duplicate = registry.Steps.FirstOrDefault(s => s.Expression == input.Expression);
        if (duplicate is not null)
        {
            throw new InvalidOperationException(
                $"duplicate step definition for \"{input.Expression}\" at " +
                $"{duplicate.ExpressionSourceFile}:{duplicate.ExpressionSourceLine} and " +
                $"{input.ExpressionSourceFile}:{input.ExpressionSourceLine}");
        }

        var compiled = new CucumberExpression(input.Expression, registry.ParameterTypes);
        var registration = new StepRegistration(
            input.Expression,
            input.ExpressionSourceFile,
            input.ExpressionSourceLine,
            input.Handler,
            compiled,
            input.Kind);
        return registry with { Steps = registry.Steps.Add(registration) };
    }

    public static Registry DefineParameterType(Registry registry, ParameterTypeInput input)
    {
        var transform = input.Parse ?? (groups => Value.Of(groups[0] ?? string.Empty));
        var parameterType = new VararParameterType(
            input.Name,
            new[] { input.Regexp },
            typeof(object),
            transform,
            useForSnippets: input.UseForSnippets);

        // Mutates the shared cucumber registry, so later step compilations resolve the type.
        registry.ParameterTypes.Define(parameterType);

        var customTypes = registry.CustomParameterTypes.Add(new CustomParameterType(input.Name, input.Regexp));
        var formats = input.Format is null ? registry.Formats : registry.Formats.SetItem(input.Name, input.Format);
        return registry with { CustomParameterTypes = customTypes, Formats = formats };
    }
}
