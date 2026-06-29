import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var-core'
import { describe, expect, it } from 'vitest'
import { createStore, type FileSystem } from './store.js'

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
  vars: { include: ['**/*.md'], exclude: [] },
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

describe('createStore over a FileSystem', () => {
  it('indexes matches from in-memory step + var files', async () => {
    const fs = fakeFs({
      '/s.steps.ts': `action('I greet {string}', (ctx, name: string) => {})\n`,
      '/hello.md': `# Hi\n\nFirst I greet "world" okay?\n`,
    })
    const store = createStore({ fs, config })
    await store.reindex()
    const matches = store.index().matches.filter((m) => m.varPath === '/hello.md')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('reflects a written file on reindex', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/a.md': '# none\n' })
    const store = createStore({ fs, config })
    await store.reindex()
    expect(store.index().matches.length).toBe(0)
    await fs.write('/s.steps.ts', `action('I greet {string}', () => {})`)
    await fs.write('/a.md', `I greet "x"`)
    await store.reindex()
    expect(store.index().matches.length).toBeGreaterThan(0)
  })

  it('recognises spec docs by the vars globs, including unsaved buffers', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/hello.md': '# Hi\n' })
    const store = createStore({ fs, config })
    await store.reindex()
    // A saved spec and an unsaved buffer that matches `vars` are both var docs;
    // a `.steps.ts` is not (it doesn't match the `**/*.md` vars glob).
    expect(store.isVarDoc('/hello.md')).toBe(true)
    expect(store.isVarDoc('/never/written/draft.md')).toBe(true)
    expect(store.isVarDoc('/s.steps.ts')).toBe(false)
  })
})
