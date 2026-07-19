import { beforeAll, describe, expect, test } from 'vitest'
import type { StepDefScanner } from '../src/scanner.ts'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

describe('tree-sitter scanner', () => {
  let scanner: StepDefScanner

  beforeAll(async () => {
    scanner = await createTreeSitterScanner(createTestGrammarLoader())
  })

  test('discovers a single step call with its source range', () => {
    const source = `import { stimulus } from '@varar/varar'
stimulus('I have {int} cukes', (ctx, n) => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe('I have {int} cukes')
    expect(defs[0]?.kind).toBe('stimulus')
    // The expression literal starts at character 8 of line 2 (1-based).
    expect(defs[0]?.expressionRange.start.line).toBe(2)
    expect(defs[0]?.callRange.start.line).toBe(2)
  })

  test('discovers multiple step calls across the file', () => {
    const source = `import { stimulus, sensor } from '@varar/varar'
stimulus('first', () => {})
stimulus('second', () => {})
sensor('third', () => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs.map((d) => d.expression)).toEqual(['first', 'second', 'third'])
    expect(defs.map((d) => d.kind)).toEqual(['stimulus', 'stimulus', 'sensor'])
  })

  test('handles the destructured-role pattern: const { stimulus } = steps(...)', () => {
    const source = `import { steps } from '@varar/varar'
const { stimulus } = steps(() => ({}))
stimulus('I greet {string}', (ctx, name: string) => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe('I greet {string}')
    expect(defs[0]?.kind).toBe('stimulus')
  })

  test('ignores `step` in unrelated positions (e.g. shadowed locals, comments)', () => {
    const source = `// stimulus('not a real step', () => {})
function stimulus() {}
const obj = { stimulus: 1 }
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(0)
  })

  test('returns empty array for a file with no step calls', () => {
    expect(scanner.discoverStepDefs('empty.ts', '')).toEqual([])
    expect(scanner.discoverStepDefs('empty.ts', 'const x = 1\n')).toEqual([])
  })

  test('discovers a paramType from a .param() call with a regexp literal', () => {
    const source = `import { steps } from '@varar/varar'
const { stimulus } = steps(() => ({})).param('airport', /[A-Z]{3}/, (r) => r)
`
    const defs = scanner.discoverParameterTypes('p.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.name).toBe('airport')
    expect(defs[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('discovers a paramType from a .param() call with a string-literal regexp', () => {
    const source = `const { stimulus } = steps(() => ({})).param('airport', '[A-Z]{3}')
`
    const defs = scanner.discoverParameterTypes('p.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.name).toBe('airport')
    expect(defs[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('discovers multiple paramTypes from chained .param() calls', () => {
    const source = `const x = steps(() => ({})).param('airport', /[A-Z]{3}/).param('digit', '[0-9]')
`
    const names = scanner.discoverParameterTypes('p.ts', source).map((d) => d.name)
    expect(names).toEqual(['airport', 'digit'])
  })

  test('skips paramType entries with a non-literal regexp', () => {
    const source = `const x = steps(() => ({})).param('airport', someRe)
`
    expect(scanner.discoverParameterTypes('p.ts', source)).toHaveLength(0)
  })

  test('returns empty when steps() has no .param() calls', () => {
    const source = `const { stimulus } = steps(() => ({ n: 0 }))
`
    expect(scanner.discoverParameterTypes('p.ts', source)).toEqual([])
  })

  test('captures the handler params range and structured (name, type) entries', () => {
    const source = `stimulus('I have {int} cukes', (ctx, count: number) => {})
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.kind).toBe('stimulus')
    expect(defs[0]?.handlerParams).toBeDefined()
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: '' },
      { name: 'count', typeText: 'number' },
    ])
    // The range starts somewhere on line 1.
    expect(defs[0]?.handlerParams?.range.start.line).toBe(1)
    expect(defs[0]?.handlerParams?.range.end.line).toBe(1)
  })

  test('is undefined when the handler is not an arrow/function expression', () => {
    const source = `const fn = (ctx: unknown) => {}
sensor('do thing', fn)
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs[0]?.handlerParams).toBeUndefined()
    expect(defs[0]?.kind).toBe('sensor')
  })

  test('decodes an escaped quote inside the expression string', () => {
    const source = `stimulus('I said \\'hi\\'', () => {})
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe("I said 'hi'")
  })
})
