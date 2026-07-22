namespace Varar.Core;

public static class FailureAnchor
{
    /// <summary>
    /// Where a failure points in the .md: a mismatch anchors at its first failing span (cell / doc
    /// string), anything else at the fallback (the step's match start). Port of <c>failure-anchor.ts</c>.
    /// </summary>
    public static Span Anchor(Exception? error, Span fallback) => error switch
    {
        CellMismatchError cm => cm.Cells.FirstOrDefault(c => !c.Ok)?.Span ?? fallback,
        _ => fallback,
    };
}
