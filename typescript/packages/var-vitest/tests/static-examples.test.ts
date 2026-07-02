import { expect, test } from 'vitest'
import { discoverStaticExamples } from '../src/static-examples.js'

const STEPS = `import { defineState } from '@oselvar/var'
const { sensor } = defineState(() => ({}))
sensor('the answer is {int}', () => [42])
`

test('discovers only examples with matched steps, named by the whole paragraph', () => {
  const source = 'Pure narration, no step.\n\nSo the answer is 42, obviously.\n'
  const examples = discoverStaticExamples({
    varPath: '/abs/deep.md',
    source,
    stepFiles: [{ path: '/abs/deep.steps.ts', source: STEPS }],
  })
  expect(examples).toEqual([{ name: 'So the answer is 42, obviously', line: 3, col: 1 }])
})

test('matches expressions that use a custom parameter type', () => {
  const steps = `import { defineState } from '@oselvar/var'
const { sensor } = defineState(() => ({}), {
  color: { regexp: /red|green/ },
})
sensor('the light is {color}', () => ['green'])
`
  const examples = discoverStaticExamples({
    varPath: '/abs/light.md',
    source: 'Right now the light is green.\n',
    stepFiles: [{ path: '/abs/light.steps.ts', source: steps }],
  })
  expect(examples).toEqual([{ name: 'Right now the light is green', line: 1, col: 1 }])
})

test('returns an empty list when no paragraph matches any step', () => {
  const examples = discoverStaticExamples({
    varPath: '/abs/prose.md',
    source: 'Just words.\n\nMore words.\n',
    stepFiles: [{ path: '/abs/deep.steps.ts', source: STEPS }],
  })
  expect(examples).toEqual([])
})
