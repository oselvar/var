import { describe, expect, it } from 'vitest'
import { appendStepDef } from './cm-generate-step.js'

// Apply the returned change to the original string the way CodeMirror would,
// so we can assert on the resulting document and the [from, to) slice.
function apply(doc: string, change: { from: number; to: number; insert: string }): string {
  return doc.slice(0, change.from) + change.insert + doc.slice(change.to)
}

const BLOCK = "step('I greet {string}', (ctx, user: string) => {\n})\n"

describe('appendStepDef', () => {
  it('appends to an empty document with no leading separator', () => {
    const { changes, from, to } = appendStepDef('', BLOCK)
    const result = apply('', changes as { from: number; to: number; insert: string })
    expect(result).toBe("step('I greet {string}', (ctx, user: string) => {\n})\n")
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('separates from existing content with exactly one blank line', () => {
    const existing = "step('a', (ctx) => {\n})\n"
    const { changes, from, to } = appendStepDef(existing, BLOCK)
    const result = apply(existing, changes as { from: number; to: number; insert: string })
    expect(result).toBe("step('a', (ctx) => {\n})\n\n" + BLOCK.trim() + '\n')
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('normalises an existing trailing blank-line run to a single separator', () => {
    const existing = "step('a', (ctx) => {\n})\n\n\n"
    const { changes, from, to } = appendStepDef(existing, BLOCK)
    const result = apply(existing, changes as { from: number; to: number; insert: string })
    expect(result).toBe("step('a', (ctx) => {\n})\n\n" + BLOCK.trim() + '\n')
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('two successive appends stack with single separators', () => {
    const first = appendStepDef('', BLOCK)
    const doc1 = apply('', first.changes as { from: number; to: number; insert: string })
    const second = appendStepDef(doc1, BLOCK)
    const doc2 = apply(doc1, second.changes as { from: number; to: number; insert: string })
    expect(doc2).toBe(BLOCK.trim() + '\n\n' + BLOCK.trim() + '\n')
    expect(doc2.slice(second.from, second.to)).toBe(BLOCK.trim())
  })
})
