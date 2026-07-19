using Varar.Core;

namespace Varar.Tests;

/// <summary>
/// Maps each conformance bundle to its C# step fixture (the injected-Registrar <c>Register</c> and
/// the initial-state factory). Explicit rather than reflective so the bundle→fixture wiring is
/// obvious and deterministic. Used by the registry/plan/trace gates.
/// </summary>
public static class ConformanceFixtures
{
    public static readonly IReadOnlyDictionary<string, Func<Registry, Registry>> Register =
        new Dictionary<string, Func<Registry, Registry>>(StringComparer.Ordinal)
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
        };

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
        };
}
