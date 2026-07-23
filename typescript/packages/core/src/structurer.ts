import type { Block, Example, Fence, Table, VarDoc } from './ast.ts'
import { spanFromOffsets } from './span.ts'

// Every paragraph / list item / blockquote becomes a candidate example. The
// names come later (the planner takes the first sentence). Headings are scope
// markers: they wrap whatever candidate blocks fall under them into nested
// `describe` groups at runtime.
//
// Tables and fences immediately following a candidate (with no intervening
// heading or thematic break) attach to that candidate's body so the planner can
// hand them to the last matched step. Otherwise they're orphans.
//
// This is pure syntax — it does NOT decide where one example ends and the next
// begins. Instead each candidate records `precededByDelimiter` (a heading or
// `---` sits before it), and the planner groups adjacent matching candidates
// into examples using that flag plus which candidates match a step. See ADR
// 0012.
export function structure(path: string, source: string, blocks: ReadonlyArray<Block>): VarDoc {
  const examples: Example[] = []
  const orphanAttachments: (Table | Fence)[] = []
  const scopeStack: { level: number; text: string }[] = []
  let lastExampleIdx = -1
  let attachmentOpen = false
  // A heading or thematic break seen since the previous candidate — the next
  // candidate is then delimiter-preceded. Starts true so the first candidate in
  // the file counts as delimiter-preceded (nothing to merge into).
  let delimiterPending = true

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        // Pop deeper-or-equal-level entries before pushing the new heading.
        while (
          scopeStack.length > 0 &&
          (scopeStack[scopeStack.length - 1]?.level ?? 0) >= block.level
        ) {
          scopeStack.pop()
        }
        scopeStack.push({ level: block.level, text: block.text })
        attachmentOpen = false
        delimiterPending = true
        break
      }
      case 'paragraph':
      case 'list_item':
      case 'blockquote': {
        examples.push({
          scopeStack: scopeStack.map((s) => s.text),
          span: block.span,
          body: [block],
          precededByDelimiter: delimiterPending,
        })
        lastExampleIdx = examples.length - 1
        attachmentOpen = true
        delimiterPending = false
        break
      }
      case 'table':
      case 'fence': {
        if (attachmentOpen && lastExampleIdx >= 0) {
          const prev = examples[lastExampleIdx]
          if (prev) {
            const span = spanFromOffsets(source, prev.span.startOffset, block.span.endOffset)
            examples[lastExampleIdx] = { ...prev, span, body: [...prev.body, block] }
            break
          }
        }
        orphanAttachments.push(block)
        break
      }
      case 'thematic_break': {
        attachmentOpen = false
        delimiterPending = true
        break
      }
    }
  }

  return { path, source, examples, orphanAttachments }
}
