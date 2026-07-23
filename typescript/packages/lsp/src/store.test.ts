import { DEFAULT_SNIPPET_TEMPLATE } from '@varar/language'
import { describe, expect, it } from 'vitest'
import { createNodeGrammarLoader } from './node-grammar-loader.ts'
import { createStore, type FileSystem } from './store.ts'

function fakeFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files))
  return {
    async list(globs) {
      // Minimal matcher: support '**/*.ext' by extension suffix.
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return [...map.keys()].filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = map.get(path)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      map.set(path, content)
    },
    matches(path, globs) {
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return exts.some((e) => path.endsWith(e))
    },
  }
}

const config = {
  docs: { include: ['**/*.md'], exclude: [] },
  steps: ['**/*.steps.ts'],
  snippets: { typescript: DEFAULT_SNIPPET_TEMPLATE },
}

const grammarLoader = createNodeGrammarLoader()

describe('createStore over a FileSystem', () => {
  it('indexes matches from in-memory step + var files', async () => {
    const fs = fakeFs({
      '/s.steps.ts': `stimulus('I greet {string}', (ctx, name: string) => {})\n`,
      '/hello.md': `# Hi\n\nFirst I greet "world" okay?\n`,
    })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    const matches = store.index().matches.filter((m) => m.varPath === '/hello.md')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('reflects a written file on reindex', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/a.md': '# none\n' })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    expect(store.index().matches.length).toBe(0)
    await fs.write('/s.steps.ts', `stimulus('I greet {string}', () => {})`)
    await fs.write('/a.md', `I greet "x"`)
    await store.reindex()
    expect(store.index().matches.length).toBeGreaterThan(0)
  })

  it('recognises spec docs by the docs globs, including unsaved buffers', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/hello.md': '# Hi\n' })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    // A saved spec and an unsaved buffer that matches `docs` are both var docs;
    // a `.steps.ts` is not (it doesn't match the `**/*.md` docs glob).
    expect(store.isVarDoc('/hello.md')).toBe(true)
    expect(store.isVarDoc('/never/written/draft.md')).toBe(true)
    expect(store.isVarDoc('/s.steps.ts')).toBe(false)
  })

  it('surfaces a drift warning for a baseline example that no longer matches', async () => {
    // The baseline says "The vault is sealed" was an example; no step matches
    // it now → drift.
    const lock = {
      version: 1,
      specs: {
        'vault.md': { sourceHash: 'fnv1a:0', examples: [{ name: 'The vault is sealed', line: 1 }] },
      },
    }
    const fs = fakeFs({
      '/s.steps.ts': `stimulus('I open the vault', () => {})\n`,
      '/vault.md': 'The vault is sealed.\n',
      '/varar.lock.json': JSON.stringify(lock),
    })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    const drift = store.index().diagnostics.filter((d) => d.code === 'drift')
    expect(drift).toHaveLength(1)
    expect(drift[0]?.varPath).toBe('/vault.md')
    expect(drift[0]?.severity).toBe('warning')
    expect(drift[0]?.message).toContain('The vault is sealed')
  })

  it('acceptDrift re-records the baseline so the drift clears on reindex', async () => {
    const lock = {
      version: 1,
      specs: {
        'vault.md': { sourceHash: 'fnv1a:0', examples: [{ name: 'The vault is sealed', line: 1 }] },
      },
    }
    const fs = fakeFs({
      '/s.steps.ts': `stimulus('I open the vault', () => {})\n`,
      '/vault.md': 'The vault is sealed.\n',
      '/varar.lock.json': JSON.stringify(lock),
    })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    expect(store.index().diagnostics.filter((d) => d.code === 'drift')).toHaveLength(1)
    await store.acceptDrift('/vault.md')
    await store.reindex()
    expect(store.index().diagnostics.filter((d) => d.code === 'drift')).toHaveLength(0)
    // The now-prose paragraph is gone from the persisted baseline.
    const written = JSON.parse(await fs.read('/varar.lock.json'))
    expect(written.specs['vault.md'].examples).toEqual([])
  })

  it('no drift warning when the baseline example still matches', async () => {
    const lock = {
      version: 1,
      specs: {
        'vault.md': { sourceHash: 'fnv1a:0', examples: [{ name: 'I open the vault', line: 1 }] },
      },
    }
    const fs = fakeFs({
      '/s.steps.ts': `stimulus('I open the vault', () => {})\n`,
      '/vault.md': 'I open the vault.\n',
      '/varar.lock.json': JSON.stringify(lock),
    })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    expect(store.index().diagnostics.filter((d) => d.code === 'drift')).toHaveLength(0)
  })

  it('snippetTemplate takes a language and returns undefined when it is not configured', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/a.md': '# none\n' })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    expect(store.snippetTemplate('typescript')).toBe(DEFAULT_SNIPPET_TEMPLATE)
    expect(store.snippetTemplate('python')).toBeUndefined()
  })

  it('indexes a TS-only workspace after the language-set-derived scanner signature change', async () => {
    // `steps` matches only `.steps.ts` files, so the store derives a
    // `['typescript']` language set from disk and builds the tree-sitter
    // scanner for just that grammar.
    const fs = fakeFs({
      '/s.steps.ts': `stimulus('I greet {string}', (ctx, name: string) => {})\n`,
      '/hello.md': `# Hi\n\nFirst I greet "world" okay?\n`,
    })
    const store = createStore({ fs, config, grammarLoader })
    await store.reindex()
    const matches = store.index().matches.filter((m) => m.varPath === '/hello.md')
    expect(matches.length).toBeGreaterThan(0)
  })
})
