import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var'
import { describe, expect, it } from 'vitest'
import { createStore, type FileSystem } from './store.js'

function fakeFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files))
  return {
    async list(globs) {
      // Minimal matcher: support '**/*.ext' by extension suffix.
      const exts = globs.map((g) => g.slice(g.lastIndexOf('.')))
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
  }
}

const config = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

describe('createStore over a FileSystem', () => {
  it('indexes matches from in-memory step + var files', async () => {
    const fs = fakeFs({
      '/s.steps.ts': `import { defineContext } from '@oselvar/var-vitest'\nconst { step } = defineContext(() => ({}))\nstep('I greet {string}', (ctx, name: string) => {})\n`,
      '/hello.var.md': `# Hi\n\nFirst I greet "world" okay?\n`,
    })
    const store = createStore({ fs, config })
    await store.reindex()
    const matches = store.index().matches.filter((m) => m.varPath === '/hello.var.md')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('reflects a written file on reindex', async () => {
    const fs = fakeFs({ '/s.steps.ts': '', '/a.var.md': '# none\n' })
    const store = createStore({ fs, config })
    await store.reindex()
    expect(store.index().matches.length).toBe(0)
    await fs.write('/s.steps.ts', `step('I greet {string}', () => {})`)
    await fs.write('/a.var.md', `I greet "x"`)
    await store.reindex()
    expect(store.index().matches.length).toBeGreaterThan(0)
  })
})
