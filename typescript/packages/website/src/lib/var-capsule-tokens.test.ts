import { describe, expect, it } from 'vitest'
import { joinStepParamTokens } from './var-capsule-tokens.js'

describe('joinStepParamTokens', () => {
  it('extends a function token through whitespace to its following parameter', () => {
    // function "I greet" at char 2 len 7; parameter ""world"" at char 10
    const tokens = [
      { line: 0, char: 2, length: 7, type: 'function' },
      { line: 0, char: 10, length: 7, type: 'parameter' },
    ]
    expect(joinStepParamTokens(tokens)).toEqual([
      { line: 0, char: 2, length: 8, type: 'function' }, // 10 - 2
      { line: 0, char: 10, length: 7, type: 'parameter' },
    ])
  })

  it('leaves a function with no following parameter unchanged', () => {
    const tokens = [{ line: 0, char: 0, length: 4, type: 'function' }]
    expect(joinStepParamTokens(tokens)).toEqual([{ line: 0, char: 0, length: 4, type: 'function' }])
  })

  it('does not join across lines', () => {
    const tokens = [
      { line: 0, char: 0, length: 3, type: 'function' },
      { line: 1, char: 0, length: 2, type: 'parameter' },
    ]
    expect(joinStepParamTokens(tokens)).toEqual(tokens)
  })

  it('joins each step on a line that has two steps', () => {
    const tokens = [
      { line: 0, char: 0, length: 7, type: 'function' },
      { line: 0, char: 8, length: 7, type: 'parameter' },
      { line: 0, char: 16, length: 6, type: 'function' },
      { line: 0, char: 23, length: 5, type: 'parameter' },
    ]
    expect(joinStepParamTokens(tokens)).toEqual([
      { line: 0, char: 0, length: 8, type: 'function' }, // 8 - 0
      { line: 0, char: 8, length: 7, type: 'parameter' },
      { line: 0, char: 16, length: 7, type: 'function' }, // 23 - 16
      { line: 0, char: 23, length: 5, type: 'parameter' },
    ])
  })
})
