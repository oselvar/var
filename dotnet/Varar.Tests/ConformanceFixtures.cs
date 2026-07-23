using Varar.Core;
using Xunit;

namespace Varar.Tests;

/// <summary>
/// Maps each conformance bundle to its C# step fixture (the injected-Registrar <c>Register</c> and
/// the initial-state factory). Explicit rather than reflective so the bundle→fixture wiring is
/// obvious and deterministic. Used by the registry/plan/trace gates.
/// </summary>
public static class ConformanceFixtures
{
    public static readonly IReadOnlyDictionary<string, Action<Steps>> Register =
        new Dictionary<string, Action<Steps>>(StringComparer.Ordinal)
        {
            ["01-roman-numerals"] = Corpus.B01.NumeralsSteps.Register,
            ["02-context-isolation"] = Corpus.B02.CounterSteps.Register,
            ["03-expected-failure"] = Corpus.B03.DivisionSteps.Register,
            ["04-tables-and-docstrings"] = Corpus.B04.EchoSteps.Register,
            ["05-ambiguous-match"] = Corpus.B05.CukesSteps.Register,
            ["06-doc-string-mismatch"] = Corpus.B06.EchoSteps.Register,
            ["07-row-check-mismatch"] = Corpus.B07.ReportSteps.Register,
            ["08-string-capture"] = Corpus.B08.GreetSteps.Register,
            ["09-expected-message-mismatch"] = Corpus.B09.BoomSteps.Register,
            ["10-error-fence-without-step"] = Corpus.B10.CukesSteps.Register,
            ["11-emoji-offsets"] = Corpus.B11.GreetSteps.Register,
            ["12-combining-marks"] = Corpus.B12.GreetSteps.Register,
            ["13-custom-parameter-type"] = Corpus.B13.AirportsSteps.Register,
            ["14-stateless-steps"] = Corpus.B14.SquaresSteps.Register,
            ["15-custom-parameter-format"] = Corpus.B15.MoneySteps.Register,
            ["16-stimulus-state-replacement"] = Corpus.B16.ReplaceSteps.Register,
            ["17-unexpected-pass"] = Corpus.B17.QuietSteps.Register,
            ["18-multi-table-example"] = Corpus.B18.BasketSteps.Register,
        };

    /// <summary>Locate the shared corpus directory by walking up from the test binary.</summary>
    public static string BundlesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "conformance", "bundles")))
        {
            dir = dir.Parent;
        }

        return dir is not null
            ? Path.Combine(dir.FullName, "conformance", "bundles")
            : throw new DirectoryNotFoundException("could not locate conformance/bundles");
    }

    /// <summary>
    /// Theory data for the registry/plan/trace gates: every directory under
    /// <c>conformance/bundles/</c>, enumerated from disk rather than from <see cref="Register"/>.
    /// Driving this off the corpus (not off our own dictionary) is what makes a newly added
    /// bundle fail loudly here instead of being silently ignored, matching the
    /// Java/Kotlin/Rust/Go/TS harnesses.
    /// </summary>
    public static TheoryData<string> Bundles()
    {
        var data = new TheoryData<string>();
        foreach (var dir in Directory.GetDirectories(BundlesDir()).OrderBy(d => d, StringComparer.Ordinal))
        {
            data.Add(Path.GetFileName(dir));
        }

        return data;
    }

    /// <summary>Fold a bundle's fixture into a registry the way the runner's loader does.</summary>
    public static Registry Build(string bundle)
    {
        if (!Register.TryGetValue(bundle, out var register))
        {
            throw new InvalidOperationException($"no C# step fixture registered for bundle {bundle}");
        }

        var s = Steps.From(Registry.Create());
        register(s);
        return s.ToRegistry();
    }

    public static readonly IReadOnlyDictionary<string, Func<Value>> State =
        new Dictionary<string, Func<Value>>(StringComparer.Ordinal)
        {
            ["01-roman-numerals"] = Corpus.B01.NumeralsSteps.State,
            ["02-context-isolation"] = Corpus.B02.CounterSteps.State,
            ["03-expected-failure"] = Corpus.B03.DivisionSteps.State,
            ["04-tables-and-docstrings"] = Corpus.B04.EchoSteps.State,
            ["05-ambiguous-match"] = Corpus.B05.CukesSteps.State,
            ["06-doc-string-mismatch"] = Corpus.B06.EchoSteps.State,
            ["07-row-check-mismatch"] = Corpus.B07.ReportSteps.State,
            ["08-string-capture"] = Corpus.B08.GreetSteps.State,
            ["09-expected-message-mismatch"] = Corpus.B09.BoomSteps.State,
            ["10-error-fence-without-step"] = Corpus.B10.CukesSteps.State,
            ["11-emoji-offsets"] = Corpus.B11.GreetSteps.State,
            ["12-combining-marks"] = Corpus.B12.GreetSteps.State,
            ["13-custom-parameter-type"] = Corpus.B13.AirportsSteps.State,
            ["14-stateless-steps"] = Corpus.B14.SquaresSteps.State,
            ["15-custom-parameter-format"] = Corpus.B15.MoneySteps.State,
            ["16-stimulus-state-replacement"] = Corpus.B16.ReplaceSteps.State,
            ["17-unexpected-pass"] = Corpus.B17.QuietSteps.State,
            ["18-multi-table-example"] = Corpus.B18.BasketSteps.State,
        };

    /// <summary>The bundle's initial-state factory, or a loud failure if none is wired.</summary>
    public static Func<Value> StateFor(string bundle) =>
        State.TryGetValue(bundle, out var factory)
            ? factory
            : throw new InvalidOperationException($"no C# state fixture registered for bundle {bundle}");
}
