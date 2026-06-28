import { describe, expect, it } from 'vitest'
import { actualAt, cellFailRanges } from './cm-run.js'
import type { RunResults } from './run-types.js'

const results: RunResults = {
  examples: [
    {
      name: 'row',
      status: 'failed',
      lines: [5],
      failure: {
        line: 5,
        message: 'm',
        stack: 's',
        cells: [
          { from: 10, to: 11, actual: '4' },
          { from: 20, to: 22, actual: '17' },
        ],
      },
    },
    {
      name: 'docstring',
      status: 'failed',
      lines: [9],
      failure: {
        line: 9,
        message: 'm',
        stack: 's',
        doc: { from: 30, to: 39, actual: 'Goodbye!\n' },
      },
    },
    { name: 'ok', status: 'passed', lines: [3] },
  ],
}

describe('cellFailRanges', () => {
  it('collects every failing cell range and the doc range, sorted by from', () => {
    expect(cellFailRanges(results)).toEqual([
      { from: 10, to: 11 },
      { from: 20, to: 22 },
      { from: 30, to: 39 },
    ])
  })

  it('is empty when nothing failed with cell info', () => {
    expect(cellFailRanges({ examples: [{ name: 'ok', status: 'passed', lines: [1] }] })).toEqual([])
  })
})

describe('actualAt', () => {
  it('returns the actual value for a position inside a failing cell or doc span', () => {
    expect(actualAt(results, 10)).toBe('4')
    expect(actualAt(results, 21)).toBe('17')
    expect(actualAt(results, 35)).toBe('Goodbye!\n')
  })

  it('returns null outside any failing range', () => {
    expect(actualAt(results, 0)).toBeNull()
    expect(actualAt(results, 15)).toBeNull()
    expect(actualAt(results, 100)).toBeNull()
  })

  it('treats the upper bound as exclusive, matching the CodeMirror mark [from,to) convention', () => {
    // exclusive at `to`: the position AFTER the last marked char is outside
    expect(actualAt(results, 22)).toBeNull() // cell {from:20,to:22} marks [20,22)
    expect(actualAt(results, 11)).toBeNull() // cell {from:10,to:11} marks [10,11)
  })
})
