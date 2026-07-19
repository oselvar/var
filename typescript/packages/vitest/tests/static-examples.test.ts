import { expect, test } from 'vitest'
import { discoverStaticExamples } from '../src/static-examples.ts'

const STEPS = `import { steps } from '@varar/varar'
const { sensor } = steps(() => ({}))
sensor('the answer is {int}', () => 42)
`

test('discovers only examples with matched steps, named by the whole paragraph', async () => {
  const source = 'Pure narration, no step.\n\nSo the answer is 42, obviously.\n'
  const examples = await discoverStaticExamples({
    varPath: '/abs/deep.md',
    source,
    stepFiles: [{ path: '/abs/deep.steps.ts', source: STEPS }],
  })
  expect(examples).toEqual([{ name: 'So the answer is 42, obviously', line: 3, col: 1 }])
})

test('matches expressions that use a custom parameter type', async () => {
  const stepSource = `import { steps } from '@varar/varar'
const { sensor } = steps(() => ({})).param('color', /red|green/)
sensor('the light is {color}', () => 'green')
`
  const examples = await discoverStaticExamples({
    varPath: '/abs/light.md',
    source: 'Right now the light is green.\n',
    stepFiles: [{ path: '/abs/light.steps.ts', source: stepSource }],
  })
  expect(examples).toEqual([{ name: 'Right now the light is green', line: 1, col: 1 }])
})

test('returns an empty list when no paragraph matches any step', async () => {
  const examples = await discoverStaticExamples({
    varPath: '/abs/prose.md',
    source: 'Just words.\n\nMore words.\n',
    stepFiles: [{ path: '/abs/deep.steps.ts', source: STEPS }],
  })
  expect(examples).toEqual([])
})
