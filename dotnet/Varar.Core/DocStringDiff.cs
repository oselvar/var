namespace Varar.Core;

public static class DocStringDiffs
{
    /// <summary>
    /// The column label a doc-string cell carries in a <see cref="CellDiff"/>, so its mismatch
    /// message reads <c>doc string: expected … but was …</c>.
    /// </summary>
    public const string DocStringColumn = "doc string";

    /// <summary>
    /// Compare a returned string against the fence body (exact, incl. trailing newline).
    /// A doc string is ONE CELL, compared whole, so a difference is an ordinary
    /// <see cref="CellDiff"/> and the executor throws the same <see cref="CellMismatchError"/> as
    /// any other cell. Expected/Actual are quoted: a doc string routinely differs only in
    /// whitespace, and bare text would render a missing trailing newline as no difference at all.
    /// </summary>
    public static CellDiff? CompareDocString(Value? returned, string content, Span span)
    {
        if (returned is null)
        {
            return null;
        }

        if (returned is not VString s)
        {
            throw new ReturnShapeError($"expected a doc string (string), got {returned.TypeName}");
        }

        if (s.Str == content)
        {
            return null;
        }

        return new CellDiff(DocStringColumn, span, Quote(content), Quote(s.Str), false);
    }

    private static string Quote(string s)
    {
        var b = new System.Text.StringBuilder(s.Length + 2);
        b.Append('"');
        foreach (var c in s)
        {
            switch (c)
            {
                case '\\': b.Append("\\\\"); break;
                case '"': b.Append("\\\""); break;
                case '\n': b.Append("\\n"); break;
                case '\r': b.Append("\\r"); break;
                case '\t': b.Append("\\t"); break;
                case '\b': b.Append("\\b"); break;
                case '\f': b.Append("\\f"); break;
                default:
                    if (c < 0x20)
                    {
                        b.Append($"\\u{(int)c:x4}");
                    }
                    else
                    {
                        b.Append(c);
                    }

                    break;
            }
        }

        return b.Append('"').ToString();
    }
}
