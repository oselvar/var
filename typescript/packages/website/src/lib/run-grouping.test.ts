import { describe, expect, it } from 'vitest'
import type { StepFile } from './run-grouping.js'
import { groupRunInputs } from './run-grouping.js'

const noHidden = new Map<string, ReadonlyArray<StepFile>>()

describe('groupRunInputs', () => {
  it('pairs a spec with the visible step files in its group', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///a.md', group: 'g1', source: '# spec' },
        { uri: 'file:///a.steps.ts', group: 'g1', source: 'action()' },
      ],
      noHidden,
    )
    expect(inputs).toEqual([
      {
        group: 'g1',
        varPath: 'a.md',
        varSource: '# spec',
        stepFiles: [{ path: 'a.steps.ts', source: 'action()' }],
      },
    ])
  })

  it('appends hidden carried steps after visible ones', () => {
    const inputs = groupRunInputs(
      [{ uri: 'file:///a.md', group: 'g1', source: '# spec' }],
      new Map([['g1', [{ path: 'hidden.steps.ts', source: 'hidden()' }]]]),
    )
    expect(inputs[0]?.stepFiles).toEqual([{ path: 'hidden.steps.ts', source: 'hidden()' }])
  })

  it('strips the file:/// scheme from hidden step paths', () => {
    const inputs = groupRunInputs(
      [{ uri: 'file:///a.md', group: 'g1', source: '# spec' }],
      new Map([['g1', [{ path: 'file:///hidden.steps.ts', source: 'hidden()' }]]]),
    )
    expect(inputs[0]?.stepFiles).toEqual([{ path: 'hidden.steps.ts', source: 'hidden()' }])
  })

  it('includes plain .ts library files alongside .steps.ts', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///a.md', group: 'g1', source: '# spec' },
        { uri: 'file:///a.steps.ts', group: 'g1', source: "import { f } from './a'" },
        { uri: 'file:///a.ts', group: 'g1', source: 'export const f = () => 1' },
      ],
      noHidden,
    )
    expect(inputs[0]?.stepFiles).toEqual([
      { path: 'a.steps.ts', source: "import { f } from './a'" },
      { path: 'a.ts', source: 'export const f = () => 1' },
    ])
  })

  it('keeps groups isolated from each other', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///a.md', group: 'g1', source: 'A' },
        { uri: 'file:///a.steps.ts', group: 'g1', source: 'sa' },
        { uri: 'file:///b.md', group: 'g2', source: 'B' },
        { uri: 'file:///b.steps.ts', group: 'g2', source: 'sb' },
      ],
      noHidden,
    )
    expect(inputs.map((i) => i.group)).toEqual(['g1', 'g2'])
    expect(inputs[0]?.stepFiles).toEqual([{ path: 'a.steps.ts', source: 'sa' }])
    expect(inputs[1]?.stepFiles).toEqual([{ path: 'b.steps.ts', source: 'sb' }])
  })

  it('skips a group with no .md', () => {
    const inputs = groupRunInputs(
      [{ uri: 'file:///only.steps.ts', group: 'g1', source: 's' }],
      noHidden,
    )
    expect(inputs).toEqual([])
  })

  it('uses the first .md when a group has several', () => {
    const inputs = groupRunInputs(
      [
        { uri: 'file:///first.md', group: 'g', source: 'F' },
        { uri: 'file:///second.md', group: 'g', source: 'S' },
      ],
      noHidden,
    )
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.varPath).toBe('first.md')
  })
})
