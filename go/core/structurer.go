package core

// Groups the flat scanner output into Examples, tracking a heading scope stack —
// port of structurer.ts / structurer.rs.
//
// This is pure syntax — it does NOT decide where one example ends and the next
// begins. Each candidate records PrecededByDelimiter (a heading or `---` sits
// before it), and the planner groups adjacent matching candidates into examples
// using that flag plus which candidates match a step. See ADR 0012.

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
	// A heading or thematic break seen since the previous candidate — the next
	// candidate is then delimiter-preceded. Starts true so the first candidate in
	// the file counts as delimiter-preceded (nothing to merge into).
	delimiterPending := true

	for _, block := range blocks {
		switch b := block.(type) {
		case Heading:
			// Pop deeper-or-equal-level entries before pushing the new heading.
			for len(scopeStack) > 0 && scopeStack[len(scopeStack)-1].level >= b.Level {
				scopeStack = scopeStack[:len(scopeStack)-1]
			}
			scopeStack = append(scopeStack, scopeEntry{level: b.Level, text: b.Text})
			attachmentOpen = false
			delimiterPending = true
		case Paragraph, ListItem, Blockquote:
			blockSpan := blockSpanOf(block)
			examples = append(examples, Example{
				ScopeStack:          scopeTexts(scopeStack),
				Span:                blockSpan,
				Body:                []Block{block},
				PrecededByDelimiter: delimiterPending,
			})
			lastExampleIdx = len(examples) - 1
			attachmentOpen = true
			delimiterPending = false
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
			delimiterPending = true
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

func scopeTexts(scopeStack []scopeEntry) []string {
	out := make([]string, len(scopeStack))
	for i, e := range scopeStack {
		out[i] = e.text
	}
	return out
}
