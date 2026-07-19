package varcore

// Projects pipeline output into the plain Value wire artifacts the conformance
// goldens pin — port of conformance.ts / conformance.rs. This file holds the
// var-doc projection; registry/plan/trace projections are added in later stages.

func obj(pairs ...[2]any) Value {
	m := make(map[string]Value, len(pairs))
	for _, p := range pairs {
		m[p[0].(string)] = p[1].(Value)
	}
	return Value{Kind: KindMap, Map: m}
}

func kv(k string, v Value) [2]any { return [2]any{k, v} }

func vint(n int) Value { return IntValue(int64(n)) }

// ToVarDocArtifact projects a parsed VarDoc to the var-doc wire artifact.
func ToVarDocArtifact(doc VarDoc) Value {
	examples := make([]Value, len(doc.Examples))
	for i := range doc.Examples {
		examples[i] = exampleValue(doc.Examples[i])
	}
	orphans := make([]Value, len(doc.OrphanAttachments))
	for i, o := range doc.OrphanAttachments {
		orphans[i] = tableOrFenceValue(o)
	}
	return obj(
		kv("path", StrValue(doc.Path)),
		kv("examples", ListOf(examples)),
		kv("orphanAttachments", ListOf(orphans)),
	)
}

func spanValue(s Span) Value {
	return obj(
		kv("startOffset", vint(s.StartOffset)),
		kv("endOffset", vint(s.EndOffset)),
		kv("startLine", vint(s.StartLine)),
		kv("startCol", vint(s.StartCol)),
		kv("endLine", vint(s.EndLine)),
		kv("endCol", vint(s.EndCol)),
	)
}

func segmentOffsetValue(o SegmentOffset) Value {
	return obj(
		kv("textOffset", vint(o.TextOffset)),
		kv("sourceOffset", vint(o.SourceOffset)),
	)
}

func segmentMapValue(m []SegmentOffset) Value {
	out := make([]Value, len(m))
	for i, o := range m {
		out[i] = segmentOffsetValue(o)
	}
	return ListOf(out)
}

func rowValue(r Row) Value {
	cells := make([]Value, len(r.Cells))
	for i, c := range r.Cells {
		cells[i] = StrValue(c)
	}
	spans := make([]Value, len(r.CellSpans))
	for i, s := range r.CellSpans {
		spans[i] = spanValue(s)
	}
	return obj(
		kv("cells", ListOf(cells)),
		kv("cellSpans", ListOf(spans)),
		kv("span", spanValue(r.Span)),
	)
}

func tableValue(t Table) Value {
	rows := make([]Value, len(t.Rows))
	for i := range t.Rows {
		rows[i] = rowValue(t.Rows[i])
	}
	return obj(
		kv("kind", StrValue("table")),
		kv("span", spanValue(t.Span)),
		kv("header", rowValue(t.Header)),
		kv("rows", ListOf(rows)),
	)
}

func fenceValue(f Fence) Value {
	return obj(
		kv("kind", StrValue("fence")),
		kv("span", spanValue(f.Span)),
		kv("info", StrValue(f.Info)),
		kv("body", StrValue(f.Body)),
		kv("bodySpan", spanValue(f.BodySpan)),
	)
}

func headingValue(h Heading) Value {
	return obj(
		kv("kind", StrValue("heading")),
		kv("level", vint(h.Level)),
		kv("text", StrValue(h.Text)),
		kv("span", spanValue(h.Span)),
	)
}

func paragraphValue(p Paragraph) Value {
	return obj(
		kv("kind", StrValue("paragraph")),
		kv("text", StrValue(p.Text)),
		kv("span", spanValue(p.Span)),
		kv("segmentMap", segmentMapValue(p.SegmentMap)),
	)
}

func listItemValue(l ListItem) Value {
	return obj(
		kv("kind", StrValue("list_item")),
		kv("text", StrValue(l.Text)),
		kv("span", spanValue(l.Span)),
		kv("segmentMap", segmentMapValue(l.SegmentMap)),
		kv("ordered", BoolValue(l.Ordered)),
		kv("markerSpan", spanValue(l.MarkerSpan)),
	)
}

func blockquoteValue(b Blockquote) Value {
	return obj(
		kv("kind", StrValue("blockquote")),
		kv("text", StrValue(b.Text)),
		kv("span", spanValue(b.Span)),
		kv("segmentMap", segmentMapValue(b.SegmentMap)),
	)
}

func thematicBreakValue(t ThematicBreak) Value {
	return obj(
		kv("kind", StrValue("thematic_break")),
		kv("span", spanValue(t.Span)),
	)
}

func blockValue(b Block) Value {
	switch v := b.(type) {
	case Heading:
		return headingValue(v)
	case Paragraph:
		return paragraphValue(v)
	case ListItem:
		return listItemValue(v)
	case Blockquote:
		return blockquoteValue(v)
	case Table:
		return tableValue(v)
	case Fence:
		return fenceValue(v)
	case ThematicBreak:
		return thematicBreakValue(v)
	}
	panic("unknown block type")
}

func tableOrFenceValue(b Block) Value {
	switch v := b.(type) {
	case Table:
		return tableValue(v)
	case Fence:
		return fenceValue(v)
	}
	panic("orphan attachment must be table or fence")
}

func exampleValue(e Example) Value {
	scope := make([]Value, len(e.ScopeStack))
	for i, s := range e.ScopeStack {
		scope[i] = StrValue(s)
	}
	body := make([]Value, len(e.Body))
	for i, blk := range e.Body {
		body[i] = blockValue(blk)
	}
	return obj(
		kv("scopeStack", ListOf(scope)),
		kv("span", spanValue(e.Span)),
		kv("body", ListOf(body)),
	)
}
