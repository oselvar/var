import { describe, expect, it } from 'vitest'
import { decodeSemanticTokens } from './cm-semantic-tokens.js'

describe('decodeSemanticTokens', () => {
  it('reverses LSP delta-encoding using the legend', () => {
    const legend = ['function', 'parameter']
    // function[L0 C0 len9], parameter[L0 C9 len1], function[L0 C10 len1]
    const data = [0, 0, 9, 0, 0, 0, 9, 1, 1, 0, 0, 1, 1, 0, 0]
    expect(decodeSemanticTokens(data, legend)).toEqual([
      { line: 0, char: 0, length: 9, type: 'function' },
      { line: 0, char: 9, length: 1, type: 'parameter' },
      { line: 0, char: 10, length: 1, type: 'function' },
    ])
  })

  it('handles line deltas (resets char to absolute on a new line)', () => {
    const data = [2, 4, 3, 0, 0, 1, 2, 2, 1, 0]
    expect(decodeSemanticTokens(data, ['function', 'parameter'])).toEqual([
      { line: 2, char: 4, length: 3, type: 'function' },
      { line: 3, char: 2, length: 2, type: 'parameter' },
    ])
  })

  it('returns [] for empty data', () => {
    expect(decodeSemanticTokens([], ['function'])).toEqual([])
  })
})
