//! AST node types produced by the scanner/structurer — port of `ast.ts` /
//! `Ast.java`. Pure data; the sealed `Block`/`TableOrFence` interfaces become
//! Rust enums (exhaustive `match` replaces `instanceof`). Immutability is by
//! construction (owned fields, no mutation) — Java's `List.copyOf` defensive
//! copies have no Rust analog.

use crate::span::Span;

/// Maps a block-text offset to its source offset (both UTF-16).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SegmentOffset {
    pub text_offset: usize,
    pub source_offset: usize,
}

impl SegmentOffset {
    pub fn new(text_offset: usize, source_offset: usize) -> SegmentOffset {
        SegmentOffset {
            text_offset,
            source_offset,
        }
    }
}

/// A markdown heading (`#`..`######`); `level` is 1–6.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Heading {
    pub level: usize,
    pub text: String,
    pub span: Span,
}

/// A markdown paragraph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Paragraph {
    pub text: String,
    pub span: Span,
    pub segment_map: Vec<SegmentOffset>,
}

/// A single list item (`-`/`*` or numbered).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ListItem {
    pub text: String,
    pub span: Span,
    pub segment_map: Vec<SegmentOffset>,
    pub ordered: bool,
    pub marker_span: Span,
}

/// A markdown blockquote (`>`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Blockquote {
    pub text: String,
    pub span: Span,
    pub segment_map: Vec<SegmentOffset>,
}

/// One row of a table: `cells` and `cell_spans` are parallel, same-length.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub cells: Vec<String>,
    pub cell_spans: Vec<Span>,
    pub span: Span,
}

/// A markdown table: a header [`Row`] plus zero or more data rows.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Table {
    pub span: Span,
    pub header: Row,
    pub rows: Vec<Row>,
}

/// A fenced code block; `info` is the text after the opening fence.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fence {
    pub span: Span,
    pub info: String,
    pub body: String,
    pub body_span: Span,
}

/// A thematic break (`---`/`***`/`___`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ThematicBreak {
    pub span: Span,
}

/// A markdown block node — the closed union the structurer matches over.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Block {
    Heading(Heading),
    Paragraph(Paragraph),
    ListItem(ListItem),
    Blockquote(Blockquote),
    Table(Table),
    Fence(Fence),
    ThematicBreak(ThematicBreak),
}

impl Block {
    /// The block's source span (exhaustive over the union).
    pub fn span(&self) -> Span {
        match self {
            Block::Heading(h) => h.span,
            Block::Paragraph(p) => p.span,
            Block::ListItem(l) => l.span,
            Block::Blockquote(b) => b.span,
            Block::Table(t) => t.span,
            Block::Fence(f) => f.span,
            Block::ThematicBreak(t) => t.span,
        }
    }
}

/// The block kinds that may appear as a [`VarDoc`] orphan attachment (`Table | Fence`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TableOrFence {
    Table(Table),
    Fence(Fence),
}

/// One matched example: the heading scope above it (outer→inner) plus its body
/// blocks (first is the candidate primary block, then any trailing attachments).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Example {
    pub scope_stack: Vec<String>,
    pub span: Span,
    pub body: Vec<Block>,
    /// True when a heading or thematic break (`---`) sits between this candidate
    /// and the previous one — i.e. a syntactic delimiter separates them (also
    /// true for the first candidate). The planner uses it to decide grouping: a
    /// matching candidate with this false merges into the open example rather
    /// than starting a new one. See ADR 0012.
    pub preceded_by_delimiter: bool,
}

/// A parsed source file: its matched examples plus unattached table/fence blocks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VarDoc {
    pub path: String,
    pub source: String,
    pub examples: Vec<Example>,
    pub orphan_attachments: Vec<TableOrFence>,
}
