import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

describe('createTreeSitterScanner', () => {
  test('discovers a step call and a parameter type', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    const stepDefs = scanner.discoverStepDefs(
      's.ts',
      `stimulus('I have {int} cukes', (ctx, n) => {})\n`,
    )
    expect(stepDefs).toHaveLength(1)
    expect(stepDefs[0]?.expression).toBe('I have {int} cukes')
    expect(stepDefs[0]?.kind).toBe('stimulus')
    expect(stepDefs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: '' },
      { name: 'n', typeText: '' },
    ])

    const paramTypes = scanner.discoverParameterTypes(
      'p.ts',
      `const x = steps(() => ({})).param('airport', /[A-Z]{3}/)\n`,
    )
    expect(paramTypes).toHaveLength(1)
    expect(paramTypes[0]?.name).toBe('airport')
    expect(paramTypes[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('reports positions in UTF-16 code units, matching a non-ASCII expression exactly', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    const source = "stimulus('café {int} 🎉', () => {})\n"
    const stepDefs = scanner.discoverStepDefs('s.ts', source)
    expect(stepDefs[0]?.expression).toBe('café {int} 🎉')
    // 'stimulus(' is 9 ASCII characters, so the string starts at UTF-16 column 9
    // (0-based) -> 1-based character 10. Verified empirically: no byte-offset
    // conversion is needed — web-tree-sitter's Parser.parse() already returns
    // UTF-16 code-unit positions when given a plain JS string.
    expect(stepDefs[0]?.expressionRange.start).toEqual({ line: 1, character: 10 })
  })

  test('selects the typescript grammar (not tsx) for .ts files', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    // A legacy angle-bracket type assertion is valid in .ts. Verified
    // empirically: under the tsx grammar this produces an ERROR node that
    // swallows the rest of the file as JSX, losing the step definition on the
    // next line entirely (0 matches instead of 1).
    const source = `const y = <string>value\nstimulus('a real step', () => {})\n`
    const stepDefs = scanner.discoverStepDefs('s.ts', source)
    expect(stepDefs).toHaveLength(1)
    expect(stepDefs[0]?.expression).toBe('a real step')
  })

  test('discovers a parameter type with a string-literal regexp', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    const paramTypes = scanner.discoverParameterTypes(
      'p.ts',
      `const x = steps(() => ({})).param('digit', '[0-9]')\n`,
    )
    expect(paramTypes).toHaveLength(1)
    expect(paramTypes[0]?.name).toBe('digit')
    expect(paramTypes[0]?.regexp).toBe('[0-9]')
  })

  test('decodes escape sequences beyond a simple quote', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader())
    const source = "stimulus('a\\tb\\u00e9c', () => {})\n"
    const stepDefs = scanner.discoverStepDefs('s.ts', source)
    expect(stepDefs[0]?.expression).toBe('a\tbéc')
  })
})
