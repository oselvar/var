import { describe, expect, test } from 'vitest'
import { generateVirtualModule, isVarSpecId, varVitestPlugin } from '../src/plugin.js'

describe('isVarSpecId', () => {
  const specs = new Set(['/abs/docs/hello.md', '/abs/docs/airport.md'])

  test('true when the id is a configured spec file', () => {
    expect(isVarSpecId('/abs/docs/hello.md', specs)).toBe(true)
  })

  test('false for a markdown file that is not a configured spec', () => {
    expect(isVarSpecId('/abs/README.md', specs)).toBe(false)
  })

  test('strips a vite query suffix before matching', () => {
    expect(isVarSpecId('/abs/docs/hello.md?v=123', specs)).toBe(true)
  })
})

describe('generateVirtualModule', () => {
  test('squeezes all imports and setup onto line 1 and places each test call on its example line', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: ['/abs/account.steps.ts'],
      source: 'Narration.\n\nThe answer is 42.\n',
      scannerPluginNames: [],
      examples: [{ name: 'The answer is 42', line: 3, col: 1 }],
    })
    const lines = out.split('\n')
    // Header: everything the tests need, on one line, so the identity line
    // mapping holds for every following line.
    expect(lines[0]).toContain("import { test } from 'vitest'")
    expect(lines[0]).toContain(
      "import { collectVarExamples, varTestBody } from '@oselvar/var-vitest/runtime'",
    )
    expect(lines[0]).toContain("import { resolveScannerPlugins } from '@oselvar/var-core'")
    expect(lines[0]).toContain('import "/abs/account.steps.ts"')
    expect(lines[0]).toContain('const PATH = "/abs/foo.md"')
    expect(lines[0]).toContain('scannerPlugins: resolveScannerPlugins([])')
    // Line 2 is filler, line 3 carries the static test registration: a string
    // literal name (so editors can discover it without running anything) and a
    // body looked up by index at runtime.
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe(
      'test("The answer is 42", varTestBody(EXAMPLES, 0, "The answer is 42", PATH))',
    )
  })

  test('indents the test call to the example column', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: '- The answer is 42.\n',
      scannerPluginNames: [],
      examples: [{ name: 'The answer is 42', line: 2, col: 3 }],
    })
    expect(out.split('\n')[1]).toBe(
      '  test("The answer is 42", varTestBody(EXAMPLES, 0, "The answer is 42", PATH))',
    )
  })

  test('an example on line 1 shares the header line', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: 'The answer is 42.\n',
      scannerPluginNames: [],
      examples: [{ name: 'The answer is 42', line: 1, col: 1 }],
    })
    const first = out.split('\n')[0] ?? ''
    expect(first).toContain('collectVarExamples')
    expect(first).toContain('test("The answer is 42", varTestBody(EXAMPLES, 0,')
  })

  test('forwards the static example count so the runtime can guard against a stale transform', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      source: 'The answer is 42.\n',
      scannerPluginNames: [],
      examples: [{ name: 'The answer is 42', line: 1, col: 1 }],
    })
    expect(out).toContain('expectedCount: 1')
    // No test(...) callsites other than the per-example ones: editors doing
    // static AST discovery must not see phantom diagnostic/guard tests.
    expect(out.match(/test\(/g)).toHaveLength(1)
  })

  test('resolves configured scanner-plugin names via var-core so scannerPlugins reach the runtime', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      scannerPluginNames: ['gherkinTables', 'gherkinDocStrings'],
      examples: [],
    })
    expect(out).toContain(
      'scannerPlugins: resolveScannerPlugins(["gherkinTables","gherkinDocStrings"])',
    )
  })
})

describe('varVitestPlugin', () => {
  test('returns a vite plugin object with name and load hook', () => {
    const plugin = varVitestPlugin()
    expect(plugin.name).toBe('@oselvar/var-vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
