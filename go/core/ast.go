package core

// AST node types produced by the scanner/structurer — port of ast.ts / ast.rs.
// Pure data; the sealed Block/TableOrFence unions become a Go interface with a
// closed set of implementers (type-switched in the conformance projection).
// Immutability is by convention — fields are never mutated after construction.

// SegmentOffset maps a block-text offset to its source offset (both UTF-16).
type SegmentOffset struct {
	TextOffset   int
	SourceOffset int
}

// Heading is a markdown heading (`#`..`######`); Level is 1–6.
type Heading struct {
	Level int
	Text  string
	Span  Span
}

// Paragraph is a markdown paragraph.
type Paragraph struct {
	Text       string
	Span       Span
	SegmentMap []SegmentOffset
}

// ListItem is a single list item (`-`/`*` or numbered).
type ListItem struct {
	Text       string
	Span       Span
	SegmentMap []SegmentOffset
	Ordered    bool
	MarkerSpan Span
}

// Blockquote is a markdown blockquote (`>`).
type Blockquote struct {
	Text       string
	Span       Span
	SegmentMap []SegmentOffset
}

// Row is one row of a table: Cells and CellSpans are parallel, same-length.
type Row struct {
	Cells     []string
	CellSpans []Span
	Span      Span
}

// Table is a markdown table: a header Row plus zero or more data rows.
type Table struct {
	Span   Span
	Header Row
	Rows   []Row
}

// Fence is a fenced code block; Info is the text after the opening fence.
type Fence struct {
	Span     Span
	Info     string
	Body     string
	BodySpan Span
}

// ThematicBreak is a thematic break (`---`/`***`/`___`).
type ThematicBreak struct {
	Span Span
}

// Block is a markdown block node — the closed union the structurer matches over.
// Only the seven types in this file implement it.
type Block interface {
	blockSpan() Span
}

func (h Heading) blockSpan() Span       { return h.Span }
func (p Paragraph) blockSpan() Span     { return p.Span }
func (l ListItem) blockSpan() Span      { return l.Span }
func (b Blockquote) blockSpan() Span    { return b.Span }
func (t Table) blockSpan() Span         { return t.Span }
func (f Fence) blockSpan() Span         { return f.Span }
func (t ThematicBreak) blockSpan() Span { return t.Span }

// blockSpanOf returns a block's source span.
func blockSpanOf(b Block) Span { return b.blockSpan() }

// Example is one matched example: the heading scope above it (outer→inner) plus
// its body blocks (first is the candidate primary block, then any attachments).
type Example struct {
	ScopeStack []string
	Span       Span
	Body       []Block
	// PrecededByDelimiter is true when a heading or thematic break (`---`) sits
	// between this candidate and the previous one — a syntactic delimiter
	// separates them (also true for the first candidate). The planner uses it to
	// decide grouping: a matching candidate with this false merges into the open
	// example rather than starting a new one. See ADR 0012.
	PrecededByDelimiter bool
}

// VarDoc is a parsed source file: its matched examples plus unattached
// table/fence blocks (each of which is a Table or Fence).
type VarDoc struct {
	Path              string
	Source            string
	Examples          []Example
	OrphanAttachments []Block
}
