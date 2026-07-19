// C# sibling of report.steps.ts / .rs (bundle 07-row-check-mismatch).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B07;

public static class ReportSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);

        // Header-bound row step: returns its computed columns; the core diffs them against the row
        // cells. score 99 != 10 → CellMismatchError.
        s.Sensor("I report the score and grade", (state, row) => Value.Map([
            new("score", Value.Of("99")),
            new("grade", Value.Of("A")),
        ]));

        return s.ToRegistry();
    }

    public static Value State() => Value.Null;
}
