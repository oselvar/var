import { describe, expect, it } from 'vitest'
import { planReplay, type ReplayOp } from './replay-plan.js'

// Apply ops the same way the scheduler will: insert splices one char in,
// delete removes one char. Proves the plan actually transforms from -> to.
function applyOps(from: string, ops: readonly ReplayOp[]): string {
  let s = from
  for (const op of ops) {
    s =
      op.kind === 'insert'
        ? s.slice(0, op.at) + op.text + s.slice(op.at)
        : s.slice(0, op.at) + s.slice(op.at + 1)
  }
  return s
}

describe('planReplay', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['identity', 'Given a var', 'Given a var'],
    ['pure append', 'Given a var', 'Given a var with 3 oars'],
    ['pure prepend', 'a var', 'Given a var'],
    ['pure delete tail', 'Given a var with 3 oars', 'Given a var'],
    ['replace in middle', 'Given a var with 1 oar', 'Given a var with 3 oars'],
    ['empty to nonempty', '', 'hello'],
    ['nonempty to empty', 'hello', ''],
    ['scattered edits', 'aXbYc', 'a1b2c'],
    ['unicode', 'café', 'cafés ☕'],
  ]

  for (const [name, from, to] of cases) {
    it(`transforms ${name}`, () => {
      const ops = planReplay(from, to)
      expect(applyOps(from, ops)).toBe(to)
    })
  }

  it('returns no ops when from === to', () => {
    expect(planReplay('same', 'same')).toEqual([])
  })

  it('emits one insert per appended character', () => {
    const ops = planReplay('ab', 'abcd')
    expect(ops).toEqual([
      { kind: 'insert', at: 2, text: 'c' },
      { kind: 'insert', at: 3, text: 'd' },
    ])
  })

  it('emits deletes right-to-left within a segment, like Backspace', () => {
    // Deleting "cd" from "abcd": the caret starts at the right end of the
    // doomed run and walks left (delete index 3 then 2), as if pressing
    // Backspace, rather than forward-Delete at a stationary caret.
    const ops = planReplay('abcd', 'ab')
    expect(ops).toEqual([
      { kind: 'delete', at: 3 },
      { kind: 'delete', at: 2 },
    ])
  })
})
