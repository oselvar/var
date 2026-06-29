import { readFileSync, writeFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { matchesGlob, relative, resolve } from 'node:path'
import type { FileSystem } from './file-system.js'

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export function createNodeFileSystem(root: string): FileSystem {
  const globAbs = async (patterns: ReadonlyArray<string>): Promise<string[]> => {
    const out: string[] = []
    for (const pattern of patterns) {
      for await (const rel of glob(pattern, { cwd: root })) {
        out.push(resolve(root, rel))
      }
    }
    return out
  }
  return {
    async list(globs) {
      const excluded = new Set(await globAbs(globs.exclude))
      const out: string[] = []
      const seen = new Set<string>()
      for (const abs of await globAbs(globs.include)) {
        if (excluded.has(abs) || seen.has(abs)) continue
        seen.add(abs)
        out.push(abs)
      }
      return out
    },
    async read(path) {
      return readFileSync(path, 'utf8')
    },
    async write(path, content) {
      writeFileSync(path, content, 'utf8')
    },
    matches(path, globs) {
      // Globs are cwd-relative; relativise the (absolute) path before matching.
      const rel = relative(root, path)
      if (globs.exclude.some((g) => matchesGlob(rel, g))) return false
      return globs.include.some((g) => matchesGlob(rel, g))
    },
  }
}
