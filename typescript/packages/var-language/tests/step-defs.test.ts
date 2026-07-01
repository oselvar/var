import { beforeAll, describe, expect, test } from 'vitest'
import { createTypeScriptScanner, type StepDefScanner } from '../src/scanner.js'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

const scannerFactories: ReadonlyArray<{
  readonly label: string
  readonly create: () => Promise<StepDefScanner>
}> = [
  { label: 'typescript-compiler', create: async () => createTypeScriptScanner() },
  { label: 'tree-sitter', create: async () => createTreeSitterScanner(createTestGrammarLoader()) },
]

describe.each(scannerFactories)('$label scanner', ({ create }) => {
  let scanner: StepDefScanner

  beforeAll(async () => {
    scanner = await create()
  })

  test('discovers a single step call with its source range', () => {
    const source = `import { action } from '@oselvar/var'
action('I have {int} cukes', (ctx, n) => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe('I have {int} cukes')
    expect(defs[0]?.kind).toBe('action')
    // The expression literal starts at character 8 of line 2 (1-based).
    expect(defs[0]?.expressionRange.start.line).toBe(2)
    expect(defs[0]?.callRange.start.line).toBe(2)
  })

  test('discovers multiple step calls across the file', () => {
    const source = `import { context, action, sensor } from '@oselvar/var'
context('first', () => {})
action('second', () => {})
sensor('third', () => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs.map((d) => d.expression)).toEqual(['first', 'second', 'third'])
    expect(defs.map((d) => d.kind)).toEqual(['context', 'action', 'sensor'])
  })

  test('handles the destructured-role pattern: const { action } = defineState(...)', () => {
    const source = `import { defineState } from '@oselvar/var'
const { action } = defineState(() => ({}))
action('I greet {string}', (ctx, name: string) => {})
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe('I greet {string}')
    expect(defs[0]?.kind).toBe('action')
  })

  test('ignores `step` in unrelated positions (e.g. shadowed locals, comments)', () => {
    const source = `// action('not a real step', () => {})
function action() {}
const obj = { action: 1 }
`
    const defs = scanner.discoverStepDefs('steps.ts', source)
    expect(defs).toHaveLength(0)
  })

  test('returns empty array for a file with no step calls', () => {
    expect(scanner.discoverStepDefs('empty.ts', '')).toEqual([])
    expect(scanner.discoverStepDefs('empty.ts', 'const x = 1\n')).toEqual([])
  })

  test('discovers a paramType from defineState with a regexp literal', () => {
    const source = `import { defineState } from '@oselvar/var-core'
const { action } = defineState(() => ({}), {
  airport: { regexp: /[A-Z]{3}/, transformer: (r) => r },
})
`
    const defs = scanner.discoverParameterTypes('p.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.name).toBe('airport')
    expect(defs[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('discovers a paramType from defineState with a string-literal regexp', () => {
    const source = `const { action } = defineState(() => ({}), {
  airport: { regexp: '[A-Z]{3}' },
})
`
    const defs = scanner.discoverParameterTypes('p.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.name).toBe('airport')
    expect(defs[0]?.regexp).toBe('[A-Z]{3}')
  })

  test('discovers multiple paramTypes from one defineState call', () => {
    const source = `const x = defineState(() => ({}), {
  airport: { regexp: /[A-Z]{3}/ },
  digit: { regexp: '[0-9]' },
})
`
    const names = scanner.discoverParameterTypes('p.ts', source).map((d) => d.name)
    expect(names).toEqual(['airport', 'digit'])
  })

  test('skips paramType entries with a non-literal regexp', () => {
    const source = `const x = defineState(() => ({}), {
  airport: { regexp: someRe },
})
`
    expect(scanner.discoverParameterTypes('p.ts', source)).toHaveLength(0)
  })

  test('returns empty when defineState has no paramTypes argument', () => {
    const source = `const { action } = defineState(() => ({ n: 0 }))
`
    expect(scanner.discoverParameterTypes('p.ts', source)).toEqual([])
  })

  test('captures the handler params range and structured (name, type) entries', () => {
    const source = `action('I have {int} cukes', (ctx, count: number) => {})
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.kind).toBe('action')
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
    const source = `action('I said \\'hi\\'', () => {})
`
    const defs = scanner.discoverStepDefs('s.ts', source)
    expect(defs).toHaveLength(1)
    expect(defs[0]?.expression).toBe("I said 'hi'")
  })
})
