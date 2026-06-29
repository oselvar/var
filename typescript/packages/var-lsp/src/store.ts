import type { VarConfig } from '@oselvar/var-core'
import { createRegistry } from '@oselvar/var-core'
import { buildWorkspaceIndex, type WorkspaceIndex } from '@oselvar/var-language'
import type { FileSystem } from './file-system.js'

export type { FileSystem } from './file-system.js'

export type StoreDeps = { readonly fs: FileSystem; readonly config: VarConfig }

export type Store = {
  reindex(): Promise<void>
  index(): WorkspaceIndex
  snippetTemplate(): string
  stepGlobs(): ReadonlyArray<string>
  // Whether a file is a var spec — i.e. it was discovered by the `vars` globs.
  // There is no `.md` extension to key off of; the config defines specs.
  isVarDoc(path: string): boolean
  fs(): FileSystem
}

export function createStore(deps: StoreDeps): Store {
  const { fs, config } = deps
  let current: WorkspaceIndex = {
    stepDefs: [],
    matches: [],
    diagnostics: [],
    registry: createRegistry(),
  }
  return {
    async reindex() {
      const stepPaths = await fs.list({ include: config.steps, exclude: [] })
      const varPaths = await fs.list(config.vars)
      const stepFiles = await Promise.all(
        stepPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      const varFiles = await Promise.all(
        varPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      current = buildWorkspaceIndex({ stepFiles, varFiles, scannerPlugins: config.scannerPlugins })
    },
    index: () => current,
    snippetTemplate: () => config.snippet.template,
    stepGlobs: () => config.steps,
    // Delegates to the filesystem port so unsaved editor buffers (which the
    // disk-backed index can't see) are still recognised as spec docs.
    isVarDoc: (path) => fs.matches(path, config.vars),
    fs: () => fs,
  }
}
