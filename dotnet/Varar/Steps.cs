using System.Runtime.CompilerServices;
using Varar.Core;

namespace Varar;

/// <summary>
/// The author facade over <see cref="Registry"/> — the C# analogue of the Rust <c>Steps</c>
/// builder and the JVM <c>StateBinder</c>. A step file exposes a
/// <c>static Registry Register(Registry r)</c> that folds its definitions in explicitly (the
/// injected-Registrar model, ADR 0008 — no module-scope accumulator):
/// <code>
/// public static class CounterSteps
/// {
///     public static Registry Register(Registry r)
///     {
///         var s = Steps.From(r);
///         s.DefineState(() => Value.Map([new("count", Value.Of(0))]));
///         s.Stimulus("I increment", state => Value.Map([new("count", Value.Of(state["count"].AsInt() + 1))]));
///         s.Sensor("The count is {int}", (state, n) => state["count"]);
///         return s.ToRegistry();
///     }
/// }
/// </code>
/// <para>
/// State evolution is <b>full replacement</b>: a <see cref="Stimulus(string, Func{Value, Value}, string, int)"/>
/// returns the whole next state. Source file/line are captured at the call site via
/// <see cref="CallerFilePathAttribute"/> / <see cref="CallerLineNumberAttribute"/>, so authors
/// never pass them; the file's stem (e.g. <c>numerals.steps</c>) is the cross-port
/// <c>stepFile</c>. A handler fails by throwing.
/// </para>
/// </summary>
public sealed class Steps
{
    private Registry _registry;

    public Steps(Registry registry) => _registry = registry;

    /// <summary>A builder that continues folding into an existing registry.</summary>
    public static Steps From(Registry registry) => new(registry);

    /// <summary>The accumulated registry.</summary>
    public Registry ToRegistry() => _registry;

    /// <summary>Declares this step file's initial-state factory (a fresh state per example).</summary>
    public Steps DefineState(ContextFactory factory, [CallerFilePath] string file = "")
    {
        _registry = _registry.WithContextFactory(file, factory);
        return this;
    }

    // ─── Stimulus: drives the software; returns the whole next state (null = no change). ───

    public Steps Stimulus(
        string expression,
        Func<Value, Value?> handler,
        [CallerFilePath] string file = "",
        [CallerLineNumber] int line = 0) =>
        Add(StepKind.Stimulus, expression, (state, _) => handler(state), file, line);

    public Steps Stimulus(
        string expression,
        Func<Value, Value, Value?> handler,
        [CallerFilePath] string file = "",
        [CallerLineNumber] int line = 0) =>
        Add(StepKind.Stimulus, expression, (state, args) => handler(state, ArgAt(args, 0)), file, line);

    public Steps Stimulus(
        string expression,
        Func<Value, Value, Value, Value?> handler,
        [CallerFilePath] string file = "",
        [CallerLineNumber] int line = 0) =>
        Add(StepKind.Stimulus, expression, (state, args) => handler(state, ArgAt(args, 0), ArgAt(args, 1)), file, line);

    // ─── Sensor: read-only assertion; returns a value to compare (null = no assertion). ───

    public Steps Sensor(
        string expression,
        Func<Value, Value?> handler,
        [CallerFilePath] string file = "",
        [CallerLineNumber] int line = 0) =>
        Add(StepKind.Sensor, expression, (state, _) => handler(state), file, line);

    public Steps Sensor(
        string expression,
        Func<Value, Value, Value?> handler,
        [CallerFilePath] string file = "",
        [CallerLineNumber] int line = 0) =>
        Add(StepKind.Sensor, expression, (state, args) => handler(state, ArgAt(args, 0)), file, line);

    public Steps Sensor(
        string expression,
        Func<Value, Value, Value, Value?> handler,
        [CallerFilePath] string file = "",
        [CallerLineNumber] int line = 0) =>
        Add(StepKind.Sensor, expression, (state, args) => handler(state, ArgAt(args, 0), ArgAt(args, 1)), file, line);

    /// <summary>Declares a custom parameter type (optionally with a value renderer for diffs).</summary>
    public Steps Param(string name, string regexp, ParameterTransform? parse = null, ParameterFormat? format = null)
    {
        _registry = Registry.DefineParameterType(_registry, new ParameterTypeInput(name, regexp, parse, format));
        return this;
    }

    private Steps Add(StepKind kind, string expression, StepHandler handler, string file, int line)
    {
        _registry = Registry.AddStep(_registry, new StepInput(expression, file, line, handler, kind));
        return this;
    }

    // Positional arg binding; a missing slot (e.g. a not-yet-appended table/doc string)
    // reads as Null. Exact arity/table semantics are the executor's (T6).
    private static Value ArgAt(IReadOnlyList<Value> args, int index) =>
        index < args.Count ? args[index] : Value.Null;
}
