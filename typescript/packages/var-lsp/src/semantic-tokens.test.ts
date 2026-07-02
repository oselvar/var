import type { MatchRef } from '@oselvar/var-language'
import { describe, expect, it } from 'vitest'
import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.js'

function r(sl: number, sc: number, el: number, ec: number) {
  return { start: { line: sl, character: sc }, end: { line: el, character: ec } }
}

describe('semanticTokenData', () => {
  it('emits non-overlapping function/parameter tokens, delta-encoded', () => {
    // source: `I greet "x"` ; whole span = function, inner x = parameter
    const source = 'I greet "x"'
    const matches = [
      {
        varPath: '/a.md',
        range: r(1, 1, 1, 12), // 0-based 0..11
        paramRanges: [r(1, 10, 1, 11)], // 0-based char 9
        paramValues: ['x'],
      } as unknown as MatchRef,
    ]
    const data = semanticTokenData(matches, '/a.md', source)
    expect(data).toEqual([
      0,
      0,
      9,
      0,
      0, // function "I greet \"" (0..9)
      0,
      9,
      1,
      1,
      0, // parameter "x" (9..10)
      0,
      1,
      1,
      0,
      0, // function "\"" (10..11)
    ])
  })

  it('paints headerCellRanges as parameter tokens in the table header row', () => {
    // Line 1: binding paragraph "the dice roll"; line 3: header row "| dice |".
    const source = 'the dice roll\n\n| dice |'
    const matches = [
      {
        varPath: '/t.md',
        range: r(1, 1, 1, 14),
        paramRanges: [r(1, 5, 1, 9)], // "dice" in the paragraph
        paramValues: ['dice'],
        headerCellRanges: [r(3, 3, 3, 7)], // "dice" in the header row
      } as unknown as MatchRef,
    ]
    const data = semanticTokenData(matches, '/t.md', source)
    // Last token: the header cell — 2 lines below the paragraph tokens,
    // char 2 (0-based), length 4, type parameter (1).
    expect(data.slice(-5)).toEqual([2, 2, 4, 1, 0])
  })

  it('returns [] when there are no matches for the file', () => {
    expect(semanticTokenData([], '/a.md', 'hello')).toEqual([])
  })

  it('legend lists function then parameter', () => {
    expect(SEMANTIC_LEGEND.tokenTypes).toEqual(['function', 'parameter'])
  })
})
