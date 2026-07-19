package varcore

import "strings"

// RowCells holds parallel, same-length trimmed cells and their source spans.
type RowCells struct {
	Cells     []string
	CellSpans []Span
}

// parseRowCells splits lineText (a `| a | b |` row) into trimmed cells and each
// cell's source span. lineStartOffset is the row's UTF-16 start offset in source.
// Port of table-cells.ts / table_cells.rs.
func parseRowCells(lineText string, lineStartOffset int, source string) RowCells {
	first := strings.IndexByte(lineText, '|')
	last := strings.LastIndexByte(lineText, '|')
	if first < 0 || last < 0 || last <= first {
		return RowCells{Cells: []string{}, CellSpans: []Span{}}
	}
	// `|` is ASCII, so first/last byte indices order identically to UTF-16.
	inner := lineText[first+1 : last]
	innerStart := utf16Index(lineText, first+1)

	cells := []string{}
	cellSpans := []Span{}
	cursor := 0
	for _, seg := range strings.Split(inner, "|") {
		trimmed := javaStrip(seg)
		leading := utf16Len(seg) - utf16Len(javaStripLeading(seg))
		absStart := lineStartOffset + innerStart + cursor + leading
		cellSpans = append(cellSpans, spanFromOffsets(source, absStart, absStart+utf16Len(trimmed)))
		cells = append(cells, trimmed)
		cursor += utf16Len(seg) + 1 // +1 for the '|' delimiter
	}
	return RowCells{Cells: cells, CellSpans: cellSpans}
}
