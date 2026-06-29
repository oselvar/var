import { globSync } from 'node:fs'
import { resolve } from 'node:path'

// node:fs/promises.glob (async) crashes on symlinked entries during recursion
// in Node 22.x. The synchronous globSync handles symlinks correctly and the
// up-front file lists are small enough that the blocking call is a non-issue.
function globAbs(cwd: string, patterns: ReadonlyArray<string>): string[] {
  const out: string[] = []
  for (const pattern of patterns) {
    for (const entry of globSync(pattern, { cwd })) {
      out.push(resolve(cwd, entry))
    }
  }
  return out
}

// Resolve `include` globs to a de-duplicated, absolute file list, dropping any
// path matched by an `exclude` glob. The single source of truth for turning a
// `{ include, exclude }` glob pair into concrete files, shared by the CLI
// (`run`/`lint`) and the vitest plugin.
export function findFiles(
  cwd: string,
  include: ReadonlyArray<string>,
  exclude: ReadonlyArray<string> = [],
): string[] {
  const excluded = new Set(globAbs(cwd, exclude))
  const out: string[] = []
  const seen = new Set<string>()
  for (const abs of globAbs(cwd, include)) {
    if (excluded.has(abs) || seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
  }
  return out
}
