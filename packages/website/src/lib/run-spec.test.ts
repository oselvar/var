import { _resetBuilder, defineContext } from '@oselvar/var-runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { runRegisteredSpec } from './run-spec.js'

afterEach(() => _resetBuilder())

const SPEC = `# Greeting\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`

describe('runRegisteredSpec', () => {
  it('passes when the handler does not throw', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({ greeting: '' }))
    step('I greet {string}', (ctx: { greeting: string }, name: string) => {
      ctx.greeting = `Hello, ${name}!`
    })
    step('the greeting should be {string}', (ctx: { greeting: string }, expected: string) => {
      if (ctx.greeting !== expected)
        throw new Error(`expected "${expected}" but was "${ctx.greeting}"`)
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples).toHaveLength(1)
    expect(results.examples[0]?.status).toBe('passed')
    expect(results.examples[0]?.lines).toContain(3)
  })

  it('fails with the message and the failing .var.md line on a throw', async () => {
    _resetBuilder()
    const { step } = defineContext(() => ({ greeting: '' }))
    step('I greet {string}', (ctx: { greeting: string }, name: string) => {
      ctx.greeting = `Hi ${name}`
    })
    step('the greeting should be {string}', (ctx: { greeting: string }, expected: string) => {
      if (ctx.greeting !== expected)
        throw new Error(`expected "${expected}" but was "${ctx.greeting}"`)
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples[0]?.status).toBe('failed')
    expect(results.examples[0]?.failure?.message).toContain('expected "Hello, world!"')
    expect(results.examples[0]?.failure?.line).toBe(3)
  })
})
