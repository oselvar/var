import { describe, expect, test } from 'vitest'
import { generateVirtualModule, isVararSpecId, vararVitestPlugin } from '../src/plugin.ts'

describe('isVararSpecId', () => {
  const specs = new Set(['/abs/docs/hello.md', '/abs/docs/airport.md'])

  test('true when the id is a configured spec file', () => {
    expect(isVararSpecId('/abs/docs/hello.md', specs)).toBe(true)
  })

  test('false for a markdown file that is not a configured spec', () => {
    expect(isVararSpecId('/abs/README.md', specs)).toBe(false)
  })

  test('strips a vite query suffix before matching', () => {
    expect(isVararSpecId('/abs/docs/hello.md?v=123', specs)).toBe(true)
  })
})

describe('generateVirtualModule', () => {
  test('squeezes all imports and setup onto line 1 and places each test call on its example line', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: ['/abs/account.steps.ts'],
      source: 'Narration.\n\nThe answer is 42.\n',
      examples: [{ name: 'The answer is 42', line: 3, col: 1 }],
    })
    const lines = out.split('\n')
    // Header: everything the tests need, on one line, so the identity line
    // mapping holds for every following line.
    expect(lines[0]).toContain("import { test } from 'vitest'")
    // Generated code may only import from packages the CONSUMER directly
    // depends on (@varar/vitest, vitest) — a bare '@varar/core'
    // would not resolve from the spec's path under pnpm's strict layout.
    expect(lines[0]).toContain(
      "import { collectVararExamples, vararTestBody } from '@varar/vitest/runtime'",
    )
    expect(lines[0]).not.toContain("from '@varar/core'")
    expect(lines[0]).toContain('import "/abs/account.steps.ts"')
    expect(lines[0]).toContain('const PATH = "/abs/foo.md"')
    // Line 2 is filler, line 3 carries the static test registration: a string
    // literal name (so editors can discover it without running anything) and a
    // body looked up by index at runtime.
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe(
      'test("The answer is 42", vararTestBody(EXAMPLES, 0, "The answer is 42", PATH))',
    )
  })

  test('indents the test call to the example column', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: '- The answer is 42.\n',
      examples: [{ name: 'The answer is 42', line: 2, col: 3 }],
    })
    expect(out.split('\n')[1]).toBe(
      '  test("The answer is 42", vararTestBody(EXAMPLES, 0, "The answer is 42", PATH))',
    )
  })

  test('an example on line 1 shares the header line', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: 'The answer is 42.\n',
      examples: [{ name: 'The answer is 42', line: 1, col: 1 }],
    })
    const first = out.split('\n')[0] ?? ''
    expect(first).toContain('collectVararExamples')
    expect(first).toContain('test("The answer is 42", vararTestBody(EXAMPLES, 0,')
  })

  test('forwards the static example count so the runtime can guard against a stale transform', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: 'The answer is 42.\n',
      examples: [{ name: 'The answer is 42', line: 1, col: 1 }],
    })
    expect(out).toContain('expectedCount: 1')
    // No test(...) callsites other than the per-example ones: editors doing
    // static AST discovery must not see phantom diagnostic/guard tests.
    expect(out.match(/test\(/g)).toHaveLength(1)
  })

  test('inlines the spec baseline so the runtime can run the read-only drift gate', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: 'The answer is 42.\n',
      examples: [{ name: 'The answer is 42', line: 1, col: 1 }],
      baseline: { sourceHash: 'fnv1a:00000000', examples: [{ name: 'The answer is 42', line: 1 }] },
    })
    expect(out).toContain('"sourceHash":"fnv1a:00000000"')
    expect(out).toContain('baseline:')
  })

  test('inlines a null baseline when the spec is not yet in varar.lock.json', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      examples: [],
    })
    expect(out).toContain('baseline: null')
  })
})

describe('vararVitestPlugin', () => {
  test('returns a vite plugin object with name and load hook', () => {
    const plugin = vararVitestPlugin()
    expect(plugin.name).toBe('@varar/vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
