package varcore

import (
	"regexp"
	"strings"
)

// Turns raw Markdown into a flat list of Block nodes — port of scanner.ts /
// scanner.rs. Offsets in stored spans are UTF-16 code units; the line splitter
// keeps a running (byte, UTF-16) dual cursor and per-line regex offsets are
// converted from bytes to UTF-16.

// rawLine is one line of source, with its UTF-16 and byte offsets in the source.
type rawLine struct {
	text        string
	startOffset int
	endOffset   int
	startByte   int
	endByte     int
}

// The `\1` backreference is expanded into three alternatives (RE2 has no
// backreferences); otherwise these mirror the reference patterns.
var (
	thematicRE    = regexp.MustCompile(`^\s*(?:-(?:\s*-){2,}|\*(?:\s*\*){2,}|_(?:\s*_){2,})\s*$`)
	ulRE          = regexp.MustCompile(`^(\s*)([-*+])\s+(.*)$`)
	olRE          = regexp.MustCompile(`^(\s*)([0-9]+)([.)])\s+(.*)$`)
	bqRE          = regexp.MustCompile(`^>\s?(.*)$`)
	fenceRE       = regexp.MustCompile("^(`{3,})\\s*(\\S*)\\s*$")
	rowRE         = regexp.MustCompile(`^\|(.+)\|\s*$`)
	delimRE       = regexp.MustCompile(`^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|\s*$`)
	headingRE     = regexp.MustCompile(`^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$`)
	headingPrefRE = regexp.MustCompile(`^#{1,6}\s+`)
)

// scan scans source into a list of Block nodes.
func scan(source string) []Block {
	lines := splitLines(source)
	var blocks []Block

	i := 0
	for i < len(lines) {
		if javaTrim(lines[i].text) == "" {
			i++
			continue
		}
		if fence, next, ok := tryFence(source, lines, i); ok {
			blocks = append(blocks, fence)
			i = next
			continue
		}
		if table, next, ok := tryTable(source, lines, i); ok {
			blocks = append(blocks, table)
			i = next
			continue
		}
		if tb, ok := tryThematicBreak(source, lines[i]); ok {
			blocks = append(blocks, tb)
			i++
			continue
		}
		if quote, next, ok := tryBlockquote(source, lines, i); ok {
			blocks = append(blocks, quote)
			i = next
			continue
		}
		if heading, ok := tryHeading(source, lines[i]); ok {
			blocks = append(blocks, heading)
			i++
			continue
		}
		if item, ok := tryListItem(source, lines[i]); ok {
			blocks = append(blocks, item)
			i++
			continue
		}
		paragraph, next := consumeParagraph(source, lines, i)
		blocks = append(blocks, paragraph)
		i = next
	}
	return blocks
}

func splitLines(source string) []rawLine {
	var out []rawLine
	byteStart := 0
	u16Start := 0
	u16 := 0
	for byteI, c := range source {
		if c == '\n' {
			out = append(out, rawLine{
				text:        source[byteStart:byteI],
				startOffset: u16Start,
				endOffset:   u16,
				startByte:   byteStart,
				endByte:     byteI,
			})
			byteStart = byteI + 1
			u16Start = u16 + 1
		}
		u16 += utf16RuneLen(c)
	}
	out = append(out, rawLine{
		text:        source[byteStart:],
		startOffset: u16Start,
		endOffset:   u16,
		startByte:   byteStart,
		endByte:     len(source),
	})
	return out
}

func tryThematicBreak(source string, line rawLine) (Block, bool) {
	if !thematicRE.MatchString(line.text) {
		return nil, false
	}
	return ThematicBreak{Span: spanFromOffsets(source, line.startOffset, line.endOffset)}, true
}

func tryHeading(source string, line rawLine) (Block, bool) {
	m := headingRE.FindStringSubmatch(line.text)
	if m == nil {
		return nil, false
	}
	hashes := m[1]
	text := javaTrim(m[2])
	return Heading{
		Level: len(hashes),
		Text:  text,
		Span:  spanFromOffsets(source, line.startOffset, line.endOffset),
	}, true
}

func tryListItem(source string, line rawLine) (Block, bool) {
	if ul := ulRE.FindStringSubmatch(line.text); ul != nil {
		text := ul[3]
		markerStart := line.startOffset + utf16Len(ul[1])
		markerEnd := markerStart + utf16Len(ul[2])
		textStart := line.startOffset + utf16Index(line.text, strings.Index(line.text, text))
		return ListItem{
			Text:       text,
			Span:       spanFromOffsets(source, line.startOffset, line.endOffset),
			SegmentMap: []SegmentOffset{{TextOffset: 0, SourceOffset: textStart}},
			Ordered:    false,
			MarkerSpan: spanFromOffsets(source, markerStart, markerEnd),
		}, true
	}
	if ol := olRE.FindStringSubmatch(line.text); ol != nil {
		text := ol[4]
		markerStart := line.startOffset + utf16Len(ol[1])
		markerEnd := markerStart + utf16Len(ol[2]) + utf16Len(ol[3])
		textStart := line.startOffset + utf16Index(line.text, strings.Index(line.text, text))
		return ListItem{
			Text:       text,
			Span:       spanFromOffsets(source, line.startOffset, line.endOffset),
			SegmentMap: []SegmentOffset{{TextOffset: 0, SourceOffset: textStart}},
			Ordered:    true,
			MarkerSpan: spanFromOffsets(source, markerStart, markerEnd),
		}, true
	}
	return nil, false
}

func tryBlockquote(source string, lines []rawLine, startIdx int) (Block, int, bool) {
	first := lines[startIdx]
	m := bqRE.FindStringSubmatch(first.text)
	if m == nil {
		return nil, 0, false
	}
	firstSegment := m[1]

	segments := []string{firstSegment}
	segmentMap := []SegmentOffset{{
		TextOffset:   0,
		SourceOffset: first.startOffset + utf16Index(first.text, strings.Index(first.text, firstSegment)),
	}}
	joinedTextOffset := utf16Len(firstSegment)

	i := startIdx + 1
	endOffset := first.endOffset
	for i < len(lines) {
		ln := lines[i]
		next := bqRE.FindStringSubmatch(ln.text)
		if next == nil {
			break
		}
		segment := next[1]
		joinedTextOffset++ // newline separator
		segmentMap = append(segmentMap, SegmentOffset{
			TextOffset:   joinedTextOffset,
			SourceOffset: ln.startOffset + utf16Index(ln.text, strings.Index(ln.text, segment)),
		})
		joinedTextOffset += utf16Len(segment)
		segments = append(segments, segment)
		endOffset = ln.endOffset
		i++
	}
	quote := Blockquote{
		Text:       strings.Join(segments, "\n"),
		Span:       spanFromOffsets(source, first.startOffset, endOffset),
		SegmentMap: segmentMap,
	}
	return quote, i, true
}

func consumeParagraph(source string, lines []rawLine, startIdx int) (Block, int) {
	first := lines[startIdx]
	endIdx := startIdx
	for endIdx+1 < len(lines) {
		t := lines[endIdx+1].text
		if javaTrim(t) == "" ||
			headingPrefRE.MatchString(t) ||
			ulRE.MatchString(t) ||
			olRE.MatchString(t) ||
			bqRE.MatchString(t) ||
			fenceRE.MatchString(t) ||
			rowRE.MatchString(t) ||
			thematicRE.MatchString(t) {
			break
		}
		endIdx++
	}
	last := lines[endIdx]
	paragraph := Paragraph{
		Text:       source[first.startByte:last.endByte],
		Span:       spanFromOffsets(source, first.startOffset, last.endOffset),
		SegmentMap: []SegmentOffset{{TextOffset: 0, SourceOffset: first.startOffset}},
	}
	return paragraph, endIdx + 1
}

func tryFence(source string, lines []rawLine, startIdx int) (Block, int, bool) {
	start := lines[startIdx]
	open := fenceRE.FindStringSubmatch(start.text)
	if open == nil {
		return nil, 0, false
	}
	fenceMarker := open[1]
	info := javaTrim(open[2])

	i := startIdx + 1
	var bodyStartU16, bodyStartByte int
	haveBodyStart := false
	var bodyEndU16, bodyEndByte int
	haveBodyEnd := false
	endOffset := start.endOffset
	for i < len(lines) {
		ln := lines[i]
		if close := fenceRE.FindStringSubmatch(ln.text); close != nil {
			if len(close[1]) >= len(fenceMarker) {
				endOffset = ln.endOffset
				break
			}
		}
		if !haveBodyStart {
			bodyStartU16 = ln.startOffset
			bodyStartByte = ln.startByte
			haveBodyStart = true
		}
		// Include the newline that separates this line from the next.
		bodyEndU16 = ln.endOffset + 1
		bodyEndByte = ln.endByte + 1
		haveBodyEnd = true
		i++
	}

	sourceU16 := utf16Len(source)
	clampedEndU16 := 0
	clampedEndByte := 0
	if haveBodyEnd {
		clampedEndU16 = min(bodyEndU16, sourceU16)
		clampedEndByte = min(bodyEndByte, len(source))
	}
	body := ""
	if haveBodyStart && haveBodyEnd {
		body = source[bodyStartByte:clampedEndByte]
	}
	fallback := start.endOffset
	bodyStartSpanU16 := fallback
	if haveBodyStart {
		bodyStartSpanU16 = bodyStartU16
	}
	bodyEndSpanU16 := fallback
	if haveBodyEnd {
		bodyEndSpanU16 = clampedEndU16
	}
	fence := Fence{
		Span:     spanFromOffsets(source, start.startOffset, endOffset),
		Info:     info,
		Body:     body,
		BodySpan: spanFromOffsets(source, bodyStartSpanU16, bodyEndSpanU16),
	}
	return fence, i + 1, true
}

func tryTable(source string, lines []rawLine, startIdx int) (Block, int, bool) {
	if startIdx+1 >= len(lines) {
		return nil, 0, false
	}
	headerLine := lines[startIdx]
	delimLine := lines[startIdx+1]
	if !rowRE.MatchString(headerLine.text) || !delimRE.MatchString(delimLine.text) {
		return nil, 0, false
	}

	headerParsed := parseRowCells(headerLine.text, headerLine.startOffset, source)
	header := Row{
		Cells:     headerParsed.Cells,
		CellSpans: headerParsed.CellSpans,
		Span:      spanFromOffsets(source, headerLine.startOffset, headerLine.endOffset),
	}

	var rows []Row
	i := startIdx + 2
	for i < len(lines) {
		ln := lines[i]
		if !rowRE.MatchString(ln.text) {
			break
		}
		parsed := parseRowCells(ln.text, ln.startOffset, source)
		rows = append(rows, Row{
			Cells:     parsed.Cells,
			CellSpans: parsed.CellSpans,
			Span:      spanFromOffsets(source, ln.startOffset, ln.endOffset),
		})
		i++
	}
	endOffset := delimLine.endOffset
	if len(rows) > 0 {
		endOffset = rows[len(rows)-1].Span.EndOffset
	}
	table := Table{
		Span:   spanFromOffsets(source, headerLine.startOffset, endOffset),
		Header: header,
		Rows:   rows,
	}
	return table, i, true
}
