using System.Collections.Immutable;
using System.Reflection;
using Varar.Core;

namespace Varar.Runner;

/// <summary>Planning, running, load-steps, and failure rendering. Port of the runner <c>run</c>/<c>render</c>/<c>steps</c>.</summary>
public static class Runner
{
    /// <summary>Parse + plan one spec.</summary>
    public static ExecutionPlan PlanSpec(string name, string source, Registry registry) =>
        Plan.Run(Parse.Run(name, source), registry);

    /// <summary>
    /// Per-example display names: the innermost heading (or the body-derived name when there is no
    /// heading), de-duplicated with a <c>[n]</c> suffix — so header-bound rows share their binding
    /// sentence's name.
    /// </summary>
    public static ImmutableArray<string> ExampleNames(ExecutionPlan plan)
    {
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        var names = ImmutableArray.CreateBuilder<string>();
        foreach (var ex in plan.Examples)
        {
            var baseName = ex.ScopeStack.Length > 0 ? ex.ScopeStack[^1] : ex.Name;
            int idx = seen.GetValueOrDefault(baseName);
            seen[baseName] = idx + 1;
            names.Add(idx == 0 ? baseName : $"{baseName}[{idx}]");
        }

        return names.ToImmutable();
    }

    /// <summary>Run a single example by index; returns the example failure (null = pass).</summary>
    public static Exception? RunExample(ExecutionPlan plan, Func<string, Value> createContext, int index) =>
        Execute.RunExample(plan, plan.Examples[index], createContext, []);

    /// <summary>Build a registry by folding every <c>static void Register(Steps)</c> in the assembly.</summary>
    public static Registry LoadSteps(Assembly assembly)
    {
        var registrars = assembly.GetTypes()
            .Select(t => t.GetMethod("Register", BindingFlags.Public | BindingFlags.Static, null, [typeof(Steps)], null))
            .Where(m => m is not null && m.ReturnType == typeof(void))
            .OrderBy(m => m!.DeclaringType!.FullName, StringComparer.Ordinal);

        var steps = Steps.From(Registry.Create());
        foreach (var m in registrars)
        {
            m!.Invoke(null, [steps]);
        }

        return steps.ToRegistry();
    }

    /// <summary>Human-readable failure rendering anchored to the <c>.md</c>. Reuses the core diff payloads.</summary>
    public static string RenderFailure(Exception error, string path)
    {
        switch (error)
        {
            case CellMismatchError cm:
                var lines = new List<string> { $"Cell mismatch in {path}:" };
                var failing = cm.Cells.Where(c => !c.Ok).ToList();
                if (failing.Count == 0)
                {
                    lines.Add("  (no failing cells)");
                }

                foreach (var cell in failing)
                {
                    lines.Add($"  line {cell.Span.StartLine} | column '{cell.Column}' — expected: \"{cell.Expected}\", actual: \"{cell.Actual}\"");
                }

                return string.Join("\n", lines);
            default:
                return error.Message;
        }
    }
}
