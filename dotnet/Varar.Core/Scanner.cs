using System.Collections.Immutable;
using System.Text.RegularExpressions;

namespace Varar.Core;

/// <summary>
/// The line-based Markdown block scanner. Port of <c>scanner.ts</c>. Built-in rules are tried at
/// each non-blank line; the built-ins fall through to a paragraph.
/// </summary>
public static partial class Scanner
{
    [GeneratedRegex(@"^\s*([-*_])(\s*\1){2,}\s*$")]
    private static partial Regex ThematicRe();

    [GeneratedRegex(@"^(\s*)([-*+])\s+(.*)$")]
    private static partial Regex UlRe();

    [GeneratedRegex(@"^(\s*)(\d+)([.)])\s+(.*)$")]
    private static partial Regex OlRe();

    [GeneratedRegex(@"^>\s?(.*)$")]
    private static partial Regex BqRe();

    [GeneratedRegex(@"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$")]
    private static partial Regex HeadingRe();

    [GeneratedRegex(@"^(`{3,})\s*(\S*)\s*$")]
    private static partial Regex FenceRe();

    [GeneratedRegex(@"^\|(.+)\|\s*$")]
    private static partial Regex RowRe();

    [GeneratedRegex(@"^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|\s*$")]
    private static partial Regex DelimRe();

    [GeneratedRegex(@"^#{1,6}\s+")]
    private static partial Regex HeadingStartRe();

    public static ImmutableArray<Block> Scan(string source)
    {
        var blocks = ImmutableArray.CreateBuilder<Block>();
        var lines = SplitLines(source);

        int i = 0;
        while (i < lines.Count)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line.Text))
            {
                i++;
                continue;
            }

            var fence = TryFence(source, lines, i);
            if (fence is not null)
            {
                blocks.Add(fence.Block);
                i = fence.Next;
                continue;
            }

            var table = TryTable(source, lines, i);
            if (table is not null)
            {
                blocks.Add(table.Block);
                i = table.Next;
                continue;
            }

            var thematic = TryThematic(source, line);
            if (thematic is not null)
            {
                blocks.Add(thematic);
                i++;
                continue;
            }

            var blockquote = TryBlockquote(source, lines, i);
            if (blockquote is not null)
            {
                blocks.Add(blockquote.Block);
                i = blockquote.Next;
                continue;
            }

            var heading = TryHeading(source, line);
            if (heading is not null)
            {
                blocks.Add(heading);
                i++;
                continue;
            }

            var listItem = TryListItem(source, line);
            if (listItem is not null)
            {
                blocks.Add(listItem);
                i++;
                continue;
            }

            var (paragraph, next) = ConsumeParagraph(source, lines, i);
            blocks.Add(paragraph);
            i = next;
        }

        return blocks.ToImmutable();
    }

    private static List<RawLine> SplitLines(string source)
    {
        var outp = new List<RawLine>();
        int start = 0;
        for (int i = 0; i < source.Length; i++)
        {
            if (source[i] == '\n')
            {
                outp.Add(new RawLine(source[start..i], start, i));
                start = i + 1;
            }
        }

        if (start <= source.Length)
        {
            outp.Add(new RawLine(Slice(source, start, source.Length), start, source.Length));
        }

        return outp;
    }

    private static Block? TryThematic(string source, RawLine line)
    {
        if (!ThematicRe().IsMatch(line.Text))
        {
            return null;
        }

        return new ThematicBreak(Span.FromOffsets(source, line.StartOffset, line.EndOffset));
    }

    private static Block? TryHeading(string source, RawLine line)
    {
        var m = HeadingRe().Match(line.Text);
        if (!m.Success)
        {
            return null;
        }

        string hashes = m.Groups[1].Value;
        string text = m.Groups[2].Value.Trim();
        int level = hashes.Length;
        return new Heading(level, text, Span.FromOffsets(source, line.StartOffset, line.EndOffset));
    }

    private static Block? TryListItem(string source, RawLine line)
    {
        var ul = UlRe().Match(line.Text);
        if (ul.Success)
        {
            string text = ul.Groups[3].Value;
            int markerStart = line.StartOffset + ul.Groups[1].Value.Length;
            int markerEnd = markerStart + ul.Groups[2].Value.Length;
            int textStart = line.StartOffset + line.Text.IndexOf(text, StringComparison.Ordinal);
            return new ListItem(
                text,
                Span.FromOffsets(source, line.StartOffset, line.EndOffset),
                [new SegmentOffset(0, textStart)],
                Ordered: false,
                Span.FromOffsets(source, markerStart, markerEnd));
        }

        var ol = OlRe().Match(line.Text);
        if (ol.Success)
        {
            string text = ol.Groups[4].Value;
            int markerStart = line.StartOffset + ol.Groups[1].Value.Length;
            int markerEnd = markerStart + ol.Groups[2].Value.Length + ol.Groups[3].Value.Length;
            int textStart = line.StartOffset + line.Text.IndexOf(text, StringComparison.Ordinal);
            return new ListItem(
                text,
                Span.FromOffsets(source, line.StartOffset, line.EndOffset),
                [new SegmentOffset(0, textStart)],
                Ordered: true,
                Span.FromOffsets(source, markerStart, markerEnd));
        }

        return null;
    }

    private static BlockMatch? TryBlockquote(string source, IReadOnlyList<RawLine> lines, int startIdx)
    {
        var first = lines[startIdx];
        var m = BqRe().Match(first.Text);
        if (!m.Success)
        {
            return null;
        }

        string firstSegment = m.Groups[1].Value;
        var segments = new List<string> { firstSegment };
        var segmentMap = ImmutableArray.CreateBuilder<SegmentOffset>();
        segmentMap.Add(new SegmentOffset(0, first.StartOffset + first.Text.IndexOf(firstSegment, StringComparison.Ordinal)));
        int joinedTextOffset = firstSegment.Length;

        int i = startIdx + 1;
        int endOffset = first.EndOffset;
        while (i < lines.Count)
        {
            var ln = lines[i];
            var next = BqRe().Match(ln.Text);
            if (!next.Success)
            {
                break;
            }

            string segment = next.Groups[1].Value;
            joinedTextOffset += 1; // newline separator
            segmentMap.Add(new SegmentOffset(joinedTextOffset, ln.StartOffset + ln.Text.IndexOf(segment, StringComparison.Ordinal)));
            segments.Add(segment);
            joinedTextOffset += segment.Length;
            endOffset = ln.EndOffset;
            i++;
        }

        var quote = new Blockquote(
            string.Join("\n", segments),
            Span.FromOffsets(source, first.StartOffset, endOffset),
            segmentMap.ToImmutable());
        return new BlockMatch(quote, i);
    }

    private static (Block Paragraph, int Next) ConsumeParagraph(
        string source,
        IReadOnlyList<RawLine> lines,
        int startIdx)
    {
        var first = lines[startIdx];
        int endIdx = startIdx;
        while (endIdx + 1 < lines.Count)
        {
            var candidate = lines[endIdx + 1];
            if (string.IsNullOrWhiteSpace(candidate.Text))
            {
                break;
            }

            if (HeadingStartRe().IsMatch(candidate.Text))
            {
                break;
            }

            if (UlRe().IsMatch(candidate.Text))
            {
                break;
            }

            if (OlRe().IsMatch(candidate.Text))
            {
                break;
            }

            if (BqRe().IsMatch(candidate.Text))
            {
                break;
            }

            if (FenceRe().IsMatch(candidate.Text))
            {
                break;
            }

            if (RowRe().IsMatch(candidate.Text))
            {
                break;
            }

            if (ThematicRe().IsMatch(candidate.Text))
            {
                break;
            }

            endIdx++;
        }

        var last = lines[endIdx];
        int startOffset = first.StartOffset;
        int endOffset = last.EndOffset;
        var paragraph = new Paragraph(
            Slice(source, startOffset, endOffset),
            Span.FromOffsets(source, startOffset, endOffset),
            [new SegmentOffset(0, startOffset)]);
        return (paragraph, endIdx + 1);
    }

    private static BlockMatch? TryFence(string source, IReadOnlyList<RawLine> lines, int startIdx)
    {
        var start = lines[startIdx];
        var open = FenceRe().Match(start.Text);
        if (!open.Success)
        {
            return null;
        }

        string fenceMarker = open.Groups[1].Value;
        string info = open.Groups[2].Value.Trim();
        int i = startIdx + 1;
        int? bodyStart = null;
        int? bodyEnd = null;
        int endOffset = start.EndOffset;
        while (i < lines.Count)
        {
            var ln = lines[i];
            var close = FenceRe().Match(ln.Text);
            if (close.Success && close.Groups[1].Value.Length >= fenceMarker.Length)
            {
                endOffset = ln.EndOffset;
                break;
            }

            bodyStart ??= ln.StartOffset;
            bodyEnd = ln.EndOffset + 1; // include the newline that separates from the next line
            i++;
        }

        string body = bodyStart is not null && bodyEnd is not null ? Slice(source, bodyStart.Value, bodyEnd.Value) : string.Empty;
        var bodySpan = Span.FromOffsets(source, bodyStart ?? start.EndOffset, bodyEnd ?? start.EndOffset);
        var fence = new Fence(
            Span.FromOffsets(source, start.StartOffset, endOffset),
            info,
            body,
            bodySpan);
        return new BlockMatch(fence, i + 1);
    }

    private static BlockMatch? TryTable(string source, IReadOnlyList<RawLine> lines, int startIdx)
    {
        if (startIdx + 1 >= lines.Count)
        {
            return null;
        }

        var headerLine = lines[startIdx];
        var delimLine = lines[startIdx + 1];
        if (!RowRe().IsMatch(headerLine.Text) || !DelimRe().IsMatch(delimLine.Text))
        {
            return null;
        }

        var (headerCells, headerSpans) = TableCells.ParseRowCells(headerLine.Text, headerLine.StartOffset, source);
        var header = new Row(headerCells, headerSpans, Span.FromOffsets(source, headerLine.StartOffset, headerLine.EndOffset));

        var rows = ImmutableArray.CreateBuilder<Row>();
        int i = startIdx + 2;
        while (i < lines.Count)
        {
            var ln = lines[i];
            if (!RowRe().IsMatch(ln.Text))
            {
                break;
            }

            var (cells, spans) = TableCells.ParseRowCells(ln.Text, ln.StartOffset, source);
            rows.Add(new Row(cells, spans, Span.FromOffsets(source, ln.StartOffset, ln.EndOffset)));
            i++;
        }

        int endOffset = rows.Count > 0 ? rows[^1].Span.EndOffset : delimLine.EndOffset;
        var table = new Table(Span.FromOffsets(source, headerLine.StartOffset, endOffset), header, rows.ToImmutable());
        return new BlockMatch(table, i);
    }

    // Clamping slice, matching JS String.prototype.slice bounds behaviour.
    internal static string Slice(string s, int start, int end)
    {
        if (start < 0)
        {
            start = 0;
        }

        if (end > s.Length)
        {
            end = s.Length;
        }

        if (end < start)
        {
            end = start;
        }

        return s.Substring(start, end - start);
    }

    private sealed record BlockMatch(Block Block, int Next);
}
