import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildHandlers } from '../src/handlers.js'
import { createStore } from '../src/store.js'

function tempWorkspace(setup: (dir: string) => void): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bdd-lsp-')))
  setup(dir)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('hoverOnMd returns the matching step def expression and source location', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    // Cursor on line 3, character 12 (somewhere inside "I have 5 cukes")
    const result = h.hover({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      // 0-based: source line 3 (Given) → LSP line 2
      position: { line: 2, character: 11 },
    })
    expect(result?.contents).toMatch(/I have \{int\} cukes/)
    expect(result?.contents).toContain('a.steps.ts')
  } finally {
    cleanup()
  }
})

test('definitionFromMd returns the steps.ts location for a matched step', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const result = h.definition({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      // 0-based: source line 3 (Given) → LSP line 2
      position: { line: 2, character: 11 },
    })
    expect(result).toHaveLength(1)
    const link = result[0]!
    expect(link.targetUri).toBe(`file://${join(dir, 'a.steps.ts')}`)
    expect(link.targetRange.start.line).toBe(0)
    // originSelectionRange covers the full matched substring (not just one word).
    expect(link.originSelectionRange.start.line).toBe(2)
    expect(link.originSelectionRange.end.line).toBe(2)
    expect(link.originSelectionRange.end.character - link.originSelectionRange.start.character)
      .toBeGreaterThan(5)
  } finally {
    cleanup()
  }
})

test('hover on the second of two adjacent steps returns the second step (off-by-one regression)', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I greet {string}', () => {})
step('the greeting is {string}', () => {})
`,
    )
    writeFileSync(
      join(dir, 'b.bdd.md'),
      '# B\n\nGiven I greet "world"\nThen the greeting is "Hello, world!"\n',
    )
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    // 0-based: source line 4 is `Then the greeting is "Hello, world!"`, char 18 = "is"
    const result = h.hover({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      position: { line: 3, character: 18 },
    })
    expect(result?.contents).toMatch(/the greeting is \{string\}/)
    expect(result?.contents).not.toMatch(/I greet \{string\}/)
  } finally {
    cleanup()
  }
})

test('matchRanges returns 0-based ranges plus per-param ranges for a .bdd.md', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I greet {string}', () => {})
step('the greeting is {string}', () => {})
`,
    )
    writeFileSync(
      join(dir, 'b.bdd.md'),
      '# B\n\nGiven I greet "world"\nThen the greeting is "Hello, world!"\n',
    )
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const entries = h.matchRanges(`file://${join(dir, 'b.bdd.md')}`)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.range.start.line).toBe(2)
    expect(entries[1]!.range.start.line).toBe(3)
    for (const e of entries) {
      expect(e.range.end.character - e.range.start.character).toBeGreaterThan(5)
      expect(e.params).toHaveLength(1)
      // Each param is narrower than the full match.
      const p = e.params[0]!
      const pLen = p.end.character - p.start.character
      const mLen = e.range.end.character - e.range.start.character
      expect(pLen).toBeLessThan(mLen)
      expect(pLen).toBeGreaterThan(0)
    }
  } finally {
    cleanup()
  }
})

test('diagnosticsFor returns missing-step diagnostics for unmatched keyword-led sentences', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const diags = h.diagnosticsFor(`file://${join(dir, 'b.bdd.md')}`)
    expect(diags).toHaveLength(1)
    expect(diags[0]?.code).toBe('missing-step')
  } finally {
    cleanup()
  }
})
