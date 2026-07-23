using System.Collections.Immutable;

namespace Varar.Core;

// The immutable Markdown AST. Port of ast.ts. Block subtypes carry the `kind`
// discriminant via their type; the conformance projection re-emits it as a string.

/// <summary>Maps a block-text offset to its source offset (block markers stripped, inline kept).</summary>
public sealed record SegmentOffset(int TextOffset, int SourceOffset);

/// <summary>A table row: trimmed cells plus each cell's trimmed-text source span.</summary>
public sealed record Row(ImmutableArray<string> Cells, ImmutableArray<Span> CellSpans, Span Span);

public abstract record Block
{
    /// <summary>The wire discriminant emitted into var-doc.json.</summary>
    public abstract string Kind { get; }

    public abstract Span Span { get; }
}

public sealed record Heading(int Level, string Text, Span Span) : Block
{
    public override string Kind => "heading";

    public override Span Span { get; } = Span;
}

public sealed record Paragraph(string Text, Span Span, ImmutableArray<SegmentOffset> SegmentMap) : Block
{
    public override string Kind => "paragraph";

    public override Span Span { get; } = Span;
}

public sealed record ListItem(
    string Text,
    Span Span,
    ImmutableArray<SegmentOffset> SegmentMap,
    bool Ordered,
    Span MarkerSpan) : Block
{
    public override string Kind => "list_item";

    public override Span Span { get; } = Span;
}

public sealed record Blockquote(string Text, Span Span, ImmutableArray<SegmentOffset> SegmentMap) : Block
{
    public override string Kind => "blockquote";

    public override Span Span { get; } = Span;
}

public sealed record Table(Span Span, Row Header, ImmutableArray<Row> Rows) : Block
{
    public override string Kind => "table";

    public override Span Span { get; } = Span;
}

public sealed record Fence(Span Span, string Info, string Body, Span BodySpan) : Block
{
    public override string Kind => "fence";

    public override Span Span { get; } = Span;
}

public sealed record ThematicBreak(Span Span) : Block
{
    public override string Kind => "thematic_break";

    public override Span Span { get; } = Span;
}

/// <summary>
/// A candidate example: the chain of enclosing heading texts (outer→inner), the span, a
/// non-empty body (a primary block, then any attached tables/fences), and whether a syntactic
/// delimiter (heading or thematic break) sits between this candidate and the previous one (also
/// true for the first candidate). The planner uses <c>PrecededByDelimiter</c> to group adjacent
/// matching candidates: a matching candidate with it <c>false</c> merges into the open example
/// rather than starting a new one. See ADR 0012.
/// </summary>
public sealed record Example(
    ImmutableArray<string> ScopeStack,
    Span Span,
    ImmutableArray<Block> Body,
    bool PrecededByDelimiter);

/// <summary>The parsed document. <c>Source</c> is kept for the runner but not projected to var-doc.json.</summary>
public sealed record VarDoc(
    string Path,
    string Source,
    ImmutableArray<Example> Examples,
    ImmutableArray<Block> OrphanAttachments);

/// <summary>A raw source line: its text and source offsets.</summary>
public sealed record RawLine(string Text, int StartOffset, int EndOffset);
