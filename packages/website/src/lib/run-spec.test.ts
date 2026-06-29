import { _resetBuilder, defineState } from '@oselvar/var-runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { runRegisteredSpec } from './run-spec.js'

afterEach(() => _resetBuilder())

const SPEC = `# Greeting\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`

describe('runRegisteredSpec', () => {
  it('passes when the handler does not throw', async () => {
    _resetBuilder()
    const { action, sensor } = defineState(() => ({ greeting: '' }))
    action('I greet {string}', (ctx, name: string) => {
      ctx.greeting = `Hello, ${name}!`
    })
    sensor('the greeting should be {string}', (ctx, _expected: string) => [ctx.greeting] as [string])
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples).toHaveLength(1)
    expect(results.examples[0]?.status).toBe('passed')
    expect(results.examples[0]?.lines).toContain(3)
  })

  it('fails with the message and the failing .var.md line on a throw', async () => {
    _resetBuilder()
    const { action } = defineState(() => ({ greeting: '' }))
    action('I greet {string}', (ctx, name: string) => {
      ctx.greeting = `Hi ${name}`
    })
    action('the greeting should be {string}', (ctx, expected: string) => {
      if (ctx.greeting !== expected)
        throw new Error(`expected "${expected}" but was "${ctx.greeting}"`)
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples[0]?.status).toBe('failed')
    expect(results.examples[0]?.failure?.message).toContain('expected "Hello, world!"')
    expect(results.examples[0]?.failure?.line).toBe(3)
  })

  it('attaches cells (source span + actual) for a header-bound row mismatch', async () => {
    _resetBuilder()
    const { sensor } = defineState(() => ({}))
    sensor('Each row lists the n and the double', (_ctx, row: { n: string; double: string }) => ({
      double: Number(row.n) * 2,
    }))
    const spec = `# Doubling

Each row lists the n and the double:

| n | double |
| - | ------ |
| 2 | 5 |
`
    const results = await runRegisteredSpec('/d.var.md', spec)
    const failed = results.examples.find((e) => e.status === 'failed')
    const cells = failed?.failure?.cells
    if (!cells) throw new Error('no cells on the failure')
    expect(cells).toHaveLength(1)
    // The span covers the EXPECTED cell text (the source), and `actual` is the runtime value.
    expect(spec.slice(cells[0]!.from, cells[0]!.to)).toBe('5')
    expect(cells[0]!.actual).toBe('4')
  })

  it('attaches doc (body span + actual) for a doc-string mismatch', async () => {
    _resetBuilder()
    const { sensor } = defineState(() => ({}))
    sensor('the greeting is', () => ['Goodbye!\n'] as [string])
    const spec = '# G\n\nthe greeting is:\n\n```text\nHello!\n```\n'
    const results = await runRegisteredSpec('/g.var.md', spec)
    const doc = results.examples[0]?.failure?.doc
    if (!doc) throw new Error('no doc on the failure')
    expect(spec.slice(doc.from, doc.to)).toBe('Hello!\n')
    expect(doc.actual).toBe('Goodbye!\n')
  })

  it('leaves cells/doc undefined for a plain thrown error', async () => {
    _resetBuilder()
    const { action } = defineState(() => ({ greeting: '' }))
    action('I greet {string}', (ctx, name: string) => {
      ctx.greeting = `Hi ${name}`
    })
    action('the greeting should be {string}', (ctx, expected: string) => {
      if (ctx.greeting !== expected) throw new Error('nope')
    })
    const results = await runRegisteredSpec('/spec.var.md', SPEC)
    expect(results.examples[0]?.failure?.cells).toBeUndefined()
    expect(results.examples[0]?.failure?.doc).toBeUndefined()
  })
})
