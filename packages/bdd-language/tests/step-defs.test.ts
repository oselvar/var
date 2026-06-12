import { expect, test } from 'vitest'
import { discoverParameterTypes, discoverStepDefs } from '../src/step-defs.js'

test('discovers a single step call with its source range', () => {
  const source = `import { step } from '@oselvar/bdd-vitest'
step('I have {int} cukes', (ctx, n) => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.expression).toBe('I have {int} cukes')
  // The expression literal starts at character 5 of line 2 (1-based).
  expect(defs[0]?.expressionRange.start.line).toBe(2)
  expect(defs[0]?.callRange.start.line).toBe(2)
})

test('discovers multiple step calls across the file', () => {
  const source = `import { step } from '@oselvar/bdd-vitest'
step('first', () => {})
step('second', () => {})
step('third', () => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs.map((d) => d.expression)).toEqual(['first', 'second', 'third'])
})

test('handles the destructured-step pattern: const { step } = defineContext(...)', () => {
  const source = `import { defineContext } from '@oselvar/bdd-vitest'
const { step } = defineContext(() => ({}))
step('I greet {string}', (ctx, name: string) => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.expression).toBe('I greet {string}')
})

test('ignores `step` in unrelated positions (e.g. shadowed locals, comments)', () => {
  const source = `// step('not a real step', () => {})
function step() {}
const obj = { step: 1 }
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(0)
})

test('returns empty array for a file with no step calls', () => {
  expect(discoverStepDefs('empty.ts', '')).toEqual([])
  expect(discoverStepDefs('empty.ts', 'const x = 1\n')).toEqual([])
})

test('discovers defineParameterType with a regexp literal', () => {
  const source = `import { defineParameterType } from '@oselvar/bdd-vitest'
defineParameterType({ name: 'airport', regexp: /[A-Z]{3}/, transformer: (r) => r })
`
  const defs = discoverParameterTypes('p.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.name).toBe('airport')
  expect(defs[0]?.regexp).toBe('[A-Z]{3}')
})

test('discovers defineParameterType with a string literal regexp', () => {
  const source = `defineParameterType({ name: 'airport', regexp: '[A-Z]{3}' })
`
  const defs = discoverParameterTypes('p.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.regexp).toBe('[A-Z]{3}')
})

test('skips defineParameterType calls with non-literal name or regexp', () => {
  const source = `const n = 'airport'
defineParameterType({ name: n, regexp: /[A-Z]{3}/ })
defineParameterType({ name: 'x', regexp: someRe })
`
  expect(discoverParameterTypes('p.ts', source)).toHaveLength(0)
})

test('captures the handler params range and structured (name, type) entries', () => {
  const source = `step('I have {int} cukes', (ctx, count: number) => {})
`
  const defs = discoverStepDefs('s.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.handlerParams).toBeDefined()
  expect(defs[0]?.handlerParams?.params).toEqual([
    { name: 'ctx', typeText: '' },
    { name: 'count', typeText: 'number' },
  ])
  // The range starts at character 27 (the 'c' of 'ctx') and ends after 'number'.
  expect(defs[0]?.handlerParams?.range.start.line).toBe(1)
  expect(defs[0]?.handlerParams?.range.end.line).toBe(1)
})

test('is undefined when the handler is not an arrow/function expression', () => {
  const source = `const fn = (ctx: unknown) => {}
step('do thing', fn)
`
  const defs = discoverStepDefs('s.ts', source)
  expect(defs[0]?.handlerParams).toBeUndefined()
})
