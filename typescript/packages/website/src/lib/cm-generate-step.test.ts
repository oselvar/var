import { EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  affordanceField,
  appendStepDef,
  flashField,
  flashRange,
  runGenerateStepDef,
  setAffordance,
} from './cm-generate-step.js'

// Apply the returned change to the original string the way CodeMirror would,
// so we can assert on the resulting document and the [from, to) slice.
function apply(doc: string, change: { from: number; to: number; insert: string }): string {
  return doc.slice(0, change.from) + change.insert + doc.slice(change.to)
}

const BLOCK = "action('I greet {string}', (ctx, user: string) => {\n})\n"

describe('appendStepDef', () => {
  it('appends to an empty document with no leading separator', () => {
    const { changes, from, to } = appendStepDef('', BLOCK)
    const result = apply('', changes as { from: number; to: number; insert: string })
    expect(result).toBe("action('I greet {string}', (ctx, user: string) => {\n})\n")
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('separates from existing content with exactly one blank line', () => {
    const existing = "action('a', (ctx) => {\n})\n"
    const { changes, from, to } = appendStepDef(existing, BLOCK)
    const result = apply(existing, changes as { from: number; to: number; insert: string })
    expect(result).toBe(`action('a', (ctx) => {\n})\n\n${BLOCK.trim()}\n`)
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('normalises an existing trailing blank-line run to a single separator', () => {
    const existing = "action('a', (ctx) => {\n})\n\n\n"
    const { changes, from, to } = appendStepDef(existing, BLOCK)
    const result = apply(existing, changes as { from: number; to: number; insert: string })
    expect(result).toBe(`action('a', (ctx) => {\n})\n\n${BLOCK.trim()}\n`)
    expect(result.slice(from, to)).toBe(BLOCK.trim())
  })

  it('two successive appends stack with single separators', () => {
    const first = appendStepDef('', BLOCK)
    const doc1 = apply('', first.changes as { from: number; to: number; insert: string })
    const second = appendStepDef(doc1, BLOCK)
    const doc2 = apply(doc1, second.changes as { from: number; to: number; insert: string })
    expect(doc2).toBe(`${BLOCK.trim()}\n\n${BLOCK.trim()}\n`)
    expect(doc2.slice(second.from, second.to)).toBe(BLOCK.trim())
  })
})

// Minimal headless EditorLike backed by an EditorState (no DOM).
function editor(doc: string, selection?: { anchor: number; head: number }) {
  let state = EditorState.create({ doc, selection })
  return {
    get state() {
      return state
    },
    dispatch(tr: TransactionSpec) {
      state = state.update(tr).state
    },
    focus() {},
  }
}

describe('runGenerateStepDef', () => {
  const generate = (text: string, _position?: { line: number; character: number }) =>
    Promise.resolve({ fullCode: `action('${text}', (ctx) => {\n})\n`, expression: text })

  it('returns null and does not touch the steps view when the selection is empty', async () => {
    const spec = editor('I greet world', { anchor: 3, head: 3 })
    const steps = editor("action('a', (ctx) => {\n})\n")
    const before = steps.state.doc.toString()
    const result = await runGenerateStepDef({ specView: spec, stepsView: steps, generate })
    expect(result).toBeNull()
    expect(steps.state.doc.toString()).toBe(before)
  })

  it('appends the generated snippet and selects the inserted block', async () => {
    const spec = editor('I greet world', { anchor: 2, head: 7 }) // selects "greet"
    const steps = editor("action('a', (ctx) => {\n})\n")
    const result = await runGenerateStepDef({ specView: spec, stepsView: steps, generate })
    expect(result).not.toBeNull()
    const doc = steps.state.doc.toString()
    expect(doc).toContain("action('greet', (ctx) => {")
    expect(doc.slice(result!.from, result!.to)).toBe("action('greet', (ctx) => {\n})")
    const sel = steps.state.selection.main
    expect([sel.from, sel.to]).toEqual([result!.from, result!.to])
    expect(result!.expression).toBe('greet')
  })
})

describe('flashField', () => {
  it('adds one decoration on flashRange set and clears it on null', () => {
    let state = EditorState.create({ doc: 'abcdef', extensions: [flashField] })
    state = state.update({ effects: flashRange.of({ from: 1, to: 4 }) }).state
    expect(state.field(flashField).size).toBe(1)
    state = state.update({ effects: flashRange.of(null) }).state
    expect(state.field(flashField).size).toBe(0)
  })
})

describe('affordanceField', () => {
  it('shows on setAffordance and hides when the selection later changes', () => {
    let state = EditorState.create({ doc: 'I greet world', extensions: [affordanceField] })
    state = state.update({ effects: setAffordance.of({ from: 2, to: 7 }) }).state
    expect(state.field(affordanceField)).toEqual({ from: 2, to: 7 })
    // A subsequent selection move (without a setAffordance effect) hides it.
    state = state.update({ selection: { anchor: 0 } }).state
    expect(state.field(affordanceField)).toBeNull()
  })

  it('hides on explicit setAffordance(null)', () => {
    let state = EditorState.create({ doc: 'abc', extensions: [affordanceField] })
    state = state.update({ effects: setAffordance.of({ from: 0, to: 3 }) }).state
    state = state.update({ effects: setAffordance.of(null) }).state
    expect(state.field(affordanceField)).toBeNull()
  })
})
