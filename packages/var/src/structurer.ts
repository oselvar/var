import type { Block, Example, Fence, Table, VarDoc } from './ast.js'
import { spanFromOffsets } from './span.js'

// Every paragraph / list item / blockquote becomes a candidate example. The
// names come later (the planner takes the first sentence). Headings are
// scope markers: they wrap whatever candidate blocks fall under them into
// nested `describe` groups at runtime.
//
// Tables and fences immediately following a candidate (with no intervening
// heading or thematic break) attach to that candidate's body so the planner
// can hand them to the last matched step. Otherwise they're orphans.
export function structure(path: string, source: string, blocks: ReadonlyArray<Block>): VarDoc {
  const examples: Example[] = []
  const orphanAttachments: (Table | Fence)[] = []
  const scopeStack: { level: number; text: string }[] = []
  let lastExampleIdx = -1
  let attachmentOpen = false

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
        break
      }
      case 'paragraph':
      case 'list_item':
      case 'blockquote': {
        // Gherkin shape: a Given→table→When→fence flow comes out as
        //   [paragraph, table, paragraph, fence]
        // and the user wants all four blocks in one example. Merge when the
        // previous example's last block is an attachment (table/fence) AND
        // there's no blank line between them.
        if (attachmentOpen && lastExampleIdx >= 0) {
          const prev = examples[lastExampleIdx]
          const prevLast = prev?.body[prev.body.length - 1]
          const lastIsAttachment = prevLast?.kind === 'table' || prevLast?.kind === 'fence'
          if (
            prev &&
            lastIsAttachment &&
            !/\n\s*\n/.test(source.slice(prev.span.endOffset, block.span.startOffset))
          ) {
            const span = spanFromOffsets(source, prev.span.startOffset, block.span.endOffset)
            examples[lastExampleIdx] = { ...prev, span, body: [...prev.body, block] }
            break
          }
        }
        examples.push({
          scopeStack: scopeStack.map((s) => s.text),
          span: block.span,
          body: [block],
        })
        lastExampleIdx = examples.length - 1
        attachmentOpen = true
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
        break
      }
    }
  }

  return { path, source, examples, orphanAttachments }
}
