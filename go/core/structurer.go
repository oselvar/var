package varcore

import "regexp"

// Groups the flat scanner output into Examples, tracking a heading scope stack —
// port of structurer.ts / structurer.rs.

var blankLineRE = regexp.MustCompile(`\n\s*\n`)

type scopeEntry struct {
	level int
	text  string
}

// structure groups blocks (scanned from source) into a VarDoc.
func structure(path, source string, blocks []Block) VarDoc {
	var examples []Example
	orphanAttachments := []Block{}
	var scopeStack []scopeEntry
	lastExampleIdx := -1
	attachmentOpen := false

	for _, block := range blocks {
		switch b := block.(type) {
		case Heading:
			// Pop deeper-or-equal-level entries before pushing the new heading.
			for len(scopeStack) > 0 && scopeStack[len(scopeStack)-1].level >= b.Level {
				scopeStack = scopeStack[:len(scopeStack)-1]
			}
			scopeStack = append(scopeStack, scopeEntry{level: b.Level, text: b.Text})
			attachmentOpen = false
		case Paragraph, ListItem, Blockquote:
			blockSpan := blockSpanOf(block)
			doMerge := false
			if attachmentOpen && lastExampleIdx >= 0 {
				body := examples[lastExampleIdx].Body
				if len(body) > 0 && isTableOrFence(body[len(body)-1]) {
					gap := utf16Slice(source, examples[lastExampleIdx].Span.EndOffset, blockSpan.StartOffset)
					if !blankLineRE.MatchString(gap) {
						doMerge = true
					}
				}
			}
			if doMerge {
				idx := lastExampleIdx
				examples[idx].Span = spanFromOffsets(source, examples[idx].Span.StartOffset, blockSpan.EndOffset)
				examples[idx].Body = append(examples[idx].Body, block)
			} else {
				examples = append(examples, Example{
					ScopeStack: scopeTexts(scopeStack),
					Span:       blockSpan,
					Body:       []Block{block},
				})
				lastExampleIdx = len(examples) - 1
				attachmentOpen = true
			}
		case Table, Fence:
			target := -1
			if attachmentOpen {
				target = lastExampleIdx
			}
			if target >= 0 {
				blockSpan := blockSpanOf(block)
				examples[target].Span = spanFromOffsets(source, examples[target].Span.StartOffset, blockSpan.EndOffset)
				examples[target].Body = append(examples[target].Body, block)
			} else {
				orphanAttachments = append(orphanAttachments, block)
			}
		case ThematicBreak:
			attachmentOpen = false
		}
	}

	if examples == nil {
		examples = []Example{}
	}
	return VarDoc{
		Path:              path,
		Source:            source,
		Examples:          examples,
		OrphanAttachments: orphanAttachments,
	}
}

func isTableOrFence(b Block) bool {
	switch b.(type) {
	case Table, Fence:
		return true
	}
	return false
}

func scopeTexts(scopeStack []scopeEntry) []string {
	out := make([]string, len(scopeStack))
	for i, e := range scopeStack {
		out[i] = e.text
	}
	return out
}
