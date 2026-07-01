import type { FileSystem } from '@oselvar/var-lsp'

const DB = 'var-fs'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function createIdbFileSystem(seed: Record<string, string> = {}): Promise<FileSystem> {
  const db = await open()
  const keys = await tx<IDBValidKey[]>(
    db,
    'readonly',
    (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>,
  )
  if (keys.length === 0) {
    for (const [path, content] of Object.entries(seed)) {
      await tx(db, 'readwrite', (s) => s.put(content, path))
    }
  }
  return {
    async list(globs) {
      const all = await tx<IDBValidKey[]>(
        db,
        'readonly',
        (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>,
      )
      const paths = all.map(String)
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return paths.filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = await tx<string | undefined>(
        db,
        'readonly',
        (s) => s.get(path) as IDBRequest<string | undefined>,
      )
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      await tx(db, 'readwrite', (s) => s.put(content, path))
    },
    matches(path, globs) {
      // Mirror `list`'s crude extension matcher: in the browser, specs are
      // distinguished from `.steps.ts` by extension, which is enough here.
      const exts = globs.include.map((g) => g.slice(g.lastIndexOf('.')))
      return exts.some((e) => path.endsWith(e))
    },
  }
}
