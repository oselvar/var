package varcore

import "unicode/utf16"

// Span is a source range [StartOffset, EndOffset) in UTF-16 code units, with
// 1-based line/column at each end. Port of span.ts / Span.java.
type Span struct {
	StartOffset int
	EndOffset   int
	StartLine   int
	StartCol    int
	EndLine     int
	EndCol      int
}

// LineCol is a 1-based line/column position.
type LineCol struct {
	Line int
	Col  int
}

// spanFromOffsets computes a Span for [startOffset, endOffset) (UTF-16 offsets)
// into source.
func spanFromOffsets(source string, startOffset, endOffset int) Span {
	start := lineCol(source, startOffset)
	end := lineCol(source, endOffset)
	return Span{
		StartOffset: startOffset,
		EndOffset:   endOffset,
		StartLine:   start.Line,
		StartCol:    start.Col,
		EndLine:     end.Line,
		EndCol:      end.Col,
	}
}

// lineCol computes the 1-based (line, col) at offset (a UTF-16 code-unit index)
// into source. Walks per UTF-16 code unit from the start, exactly like the JS
// charAt loop (so an astral character advances col by 2).
func lineCol(source string, offset int) LineCol {
	units := utf16.Encode([]rune(source))
	line, col := 1, 1
	for idx, u := range units {
		if idx >= offset {
			break
		}
		if u == 0x000A {
			line++
			col = 1
		} else {
			col++
		}
	}
	return LineCol{Line: line, Col: col}
}
