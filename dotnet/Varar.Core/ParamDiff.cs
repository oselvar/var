using System.Collections.Immutable;

namespace Varar.Core;

public static class ParamDiff
{
    /// <summary>
    /// Compare a sensor's returned inline actuals against the captured arguments. Port of
    /// <c>param-diff.ts</c>: <paramref name="sourceTexts"/> supplies the diff's expected display and
    /// <paramref name="formats"/> renders the actual side (document notation) when present.
    /// </summary>
    public static ImmutableArray<CellDiff> CompareParams(
        IReadOnlyList<Value> returned,
        ImmutableArray<Value> expected,
        ImmutableArray<Span> paramSpans,
        IReadOnlyList<string> sourceTexts,
        ImmutableArray<ParameterFormat?> formats)
    {
        var diffs = ImmutableArray.CreateBuilder<CellDiff>();
        for (int i = 0; i < expected.Length; i++)
        {
            bool ok = returned[i].Equals(expected[i]);
            var format = i < formats.Length ? formats[i] : null;
            var (actualText, viaFormat) = RenderParamValue(returned[i], format);
            var expectedText = i < sourceTexts.Count
                ? sourceTexts[i]
                : RenderParamValue(expected[i], format).Text;
            diffs.Add(new CellDiff(
                $"cell {i + 1}",
                paramSpans[i],
                expectedText,
                actualText,
                ok,
                expected[i],
                returned[i],
                viaFormat));
        }

        return diffs.ToImmutable();
    }

    private static (string Text, bool ViaFormat) RenderParamValue(Value value, ParameterFormat? format)
    {
        if (format is not null)
        {
            try
            {
                return (format(value), true);
            }
            catch
            {
                // fall through to the generic rendering
            }
        }

        return (CellDiffs.RenderCellValue(value), false);
    }
}
