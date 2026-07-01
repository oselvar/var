import type { VarConfig } from '@oselvar/var-config'
import { createRegistry } from '@oselvar/var-core'
import {
  buildWorkspaceIndex,
  createTreeSitterScanner,
  type GrammarLoader,
  type StepDefScanner,
  type WorkspaceIndex,
} from '@oselvar/var-language'
import type { FileSystem } from './file-system.js'

export type { FileSystem } from './file-system.js'

export type StoreDeps = {
  readonly fs: FileSystem
  readonly config: VarConfig
  // Optional: when supplied, step-def extraction uses the tree-sitter
  // scanner. When omitted, buildWorkspaceIndex falls back to its own
  // default (the TypeScript-compiler-based scanner) — this is how a
  // consumer without a GrammarLoader for its environment (e.g. the
  // website's browser worker, which has no wasm-loading story yet) keeps
  // working unchanged.
  readonly grammarLoader?: GrammarLoader
}

export type Store = {
  reindex(): Promise<void>
  index(): WorkspaceIndex
  snippetTemplate(): string | undefined
  stepGlobs(): ReadonlyArray<string>
  // Whether a file is a var spec — i.e. it was discovered by the `vars` globs.
  // There is no `.md` extension to key off of; the config defines specs.
  isVarDoc(path: string): boolean
  fs(): FileSystem
}

export function createStore(deps: StoreDeps): Store {
  const { fs, config, grammarLoader } = deps
  let current: WorkspaceIndex = {
    stepDefs: [],
    matches: [],
    diagnostics: [],
    registry: createRegistry(),
  }
  // Created once, lazily, on the first reindex — not in createStore itself,
  // which stays synchronous. Later reindexes reuse it.
  let scannerPromise: Promise<StepDefScanner> | undefined
  return {
    async reindex() {
      if (grammarLoader) scannerPromise ??= createTreeSitterScanner(grammarLoader)
      const scanner = grammarLoader ? await scannerPromise : undefined
      const stepPaths = await fs.list({ include: config.steps, exclude: [] })
      const varPaths = await fs.list(config.vars)
      const stepFiles = await Promise.all(
        stepPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      const varFiles = await Promise.all(
        varPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      current = buildWorkspaceIndex({
        stepFiles,
        varFiles,
        scannerPlugins: config.scannerPlugins,
        ...(scanner ? { scanner } : {}),
      })
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
