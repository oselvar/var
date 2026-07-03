import type { FileSystem } from '@oselvar/var-lsp'

// Fresh on every worker start (i.e. every page load) — this is a demo site,
// not a persistent coding environment, so there's no cross-reload storage to
// go stale. Edits made during a session live only as long as the tab does.
export function createMemoryFileSystem(seed: Record<string, string> = {}): FileSystem {
  const files = new Map(Object.entries(seed))
  return {
    async list(globs) {
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return [...files.keys()].filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = files.get(path)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      files.set(path, content)
    },
    matches(path, globs) {
      // Mirror `list`'s crude extension matcher: in the browser, specs are
      // distinguished from `.steps.ts` by extension, which is enough here.
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return exts.some((e) => path.endsWith(e))
    },
  }
}
