import type { VarConfig } from '@varar/config'
import {
  createRegistry,
  deriveSpecBaseline,
  detectDrift,
  driftDetected,
  parse,
  parseVarLock,
  plan,
  type Registry,
  stringifyVarLock,
  type VarLock,
} from '@varar/core'
import {
  buildWorkspaceIndex,
  createTreeSitterScanner,
  type DiagnosticRef,
  type GrammarLoader,
  languageIdForPath,
  type StepDefScanner,
  type WorkspaceIndex,
} from '@varar/language'
import type { FileSystem } from './file-system.ts'

export type { FileSystem } from './file-system.ts'

export type StoreDeps = {
  readonly fs: FileSystem
  readonly config: VarConfig
  // Supplies tree-sitter grammar bytes for step-def extraction. Every
  // environment provides one — Node resolves the `.wasm` from node_modules,
  // the browser worker fetches bundled URLs — so extraction goes through the
  // one tree-sitter scanner everywhere.
  readonly grammarLoader: GrammarLoader
}

export type Store = {
  reindex(): Promise<void>
  index(): WorkspaceIndex
  snippetTemplate(language: string): string | undefined
  stepGlobs(): ReadonlyArray<string>
  // The step files found at the last reindex — used by the LSP's
  // per-language snippet-selection algorithm to pick the language owning the
  // most step files when several are configured.
  stepPaths(): ReadonlyArray<string>
  // Whether a file is a var spec — i.e. it was discovered by the `docs` globs.
  // There is no `.md` extension to key off of; the config defines specs.
  isVarDoc(path: string): boolean
  // Accept drift for one spec: re-record its varar.lock.json baseline to the
  // current live examples, so a now-prose paragraph is no longer flagged. The
  // caller reindexes afterwards to clear the squiggle.
  acceptDrift(varPath: string): Promise<void>
  fs(): FileSystem
}

// Drift diagnostics for the workspace: for each spec with a varar.lock.json
// baseline entry, a paragraph that was an example and now matches no step.
// Returns [] when there is no baseline (e.g. the browser, whose memory FS has
// no varar.lock.json — drift there is shown via the run pipeline, not the LSP).
async function driftDiagnosticRefs(
  fs: FileSystem,
  varFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>,
  registry: Registry,
): Promise<DiagnosticRef[]> {
  const [lockAbs] = await fs.list({ include: ['varar.lock.json'], exclude: [] })
  if (!lockAbs) return []
  let lockText: string
  try {
    lockText = await fs.read(lockAbs)
  } catch {
    return []
  }
  const lock = parseVarLock(lockText)
  if (!lock) return []
  // varar.lock.json sits at the workspace root; trim it to get the root prefix
  // (string-only, so this stays free of node:path for the browser build).
  const root = lockAbs.slice(0, lockAbs.length - 'varar.lock.json'.length).replace(/[/\\]+$/, '')
  const refs: DiagnosticRef[] = []
  for (const vf of varFiles) {
    const specPath = toSpecPath(root, vf.path)
    const baseline = lock.specs[specPath]
    if (!baseline) continue
    const varDoc = parse(vf.path, vf.source)
    const executionPlan = plan(varDoc, registry)
    for (const drift of detectDrift(baseline, varDoc, executionPlan)) {
      const diag = driftDetected({ name: drift.name, span: drift.span })
      refs.push({
        varPath: vf.path,
        code: diag.code,
        // A warning (amber) in the editor — same as the browser — while the
        // runner treats drift as a hard failure.
        severity: 'warning',
        message: diag.message,
        range: {
          start: { line: drift.span.startLine, character: drift.span.startCol },
          end: { line: drift.span.endLine, character: drift.span.endCol },
        },
      })
    }
  }
  return refs
}

function toSpecPath(root: string, abs: string): string {
  const rel = abs.startsWith(root) ? abs.slice(root.length) : abs
  return rel
    .replace(/^[/\\]+/, '')
    .split('\\')
    .join('/')
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
  let scannerKey: string | undefined
  let currentStepPaths: ReadonlyArray<string> = []
  return {
    async reindex() {
      const stepPaths = await fs.list({ include: config.steps, exclude: [] })
      currentStepPaths = stepPaths
      // Derive the scanner's language set from what's actually on disk, so a
      // TS-only workspace never pays to load python/java/kotlin grammars —
      // and rebuild the scanner only when that set changes (dialects are
      // cached per loader inside the scanner module, so a wider rebuild
      // reuses already-loaded grammars).
      const languages = [...new Set(stepPaths.map(languageIdForPath))]
        .filter((id): id is NonNullable<typeof id> => id !== undefined)
        .sort()
      const key = languages.join(',')
      if (key !== scannerKey) {
        scannerKey = key
        scannerPromise = createTreeSitterScanner(
          grammarLoader,
          languages.length > 0 ? languages : undefined,
        )
      }
      // Always assigned by the first reindex (scannerKey starts undefined, so
      // the initial key comparison never matches).
      // biome-ignore lint/style/noNonNullAssertion: set on the first reindex
      const scanner = await scannerPromise!
      const varPaths = await fs.list(config.docs)
      const stepFiles = await Promise.all(
        stepPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      const varFiles = await Promise.all(
        varPaths.map(async (path) => ({ path, source: await fs.read(path) })),
      )
      current = buildWorkspaceIndex({
        stepFiles,
        varFiles,
        scanner,
      })
      // Drift is a run-result concern, but the LSP surfaces it live: a
      // paragraph the committed varar.lock.json recorded as an example that now
      // matches no step gets a warning squiggle. Additive to the index's own
      // parse/plan diagnostics.
      const drift = await driftDiagnosticRefs(fs, varFiles, current.registry)
      if (drift.length > 0)
        current = { ...current, diagnostics: [...current.diagnostics, ...drift] }
    },
    index: () => current,
    snippetTemplate: (language) =>
      Object.hasOwn(config.snippets, language) ? config.snippets[language] : undefined,
    stepGlobs: () => config.steps,
    stepPaths: () => currentStepPaths,
    // Delegates to the filesystem port so unsaved editor buffers (which the
    // disk-backed index can't see) are still recognised as spec docs.
    isVarDoc: (path) => fs.matches(path, config.docs),
    async acceptDrift(varPath) {
      const [lockAbs] = await fs.list({ include: ['varar.lock.json'], exclude: [] })
      // No baseline file yet → nothing has been recorded, so nothing to accept.
      if (!lockAbs) return
      const existing = parseVarLock(await fs.read(lockAbs).catch(() => ''))
      const root = lockAbs
        .slice(0, lockAbs.length - 'varar.lock.json'.length)
        .replace(/[/\\]+$/, '')
      const specPath = toSpecPath(root, varPath)
      const source = await fs.read(varPath)
      const varDoc = parse(varPath, source)
      const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, current.registry))
      const next: VarLock = {
        version: 1,
        specs: { ...(existing?.specs ?? {}), [specPath]: baseline },
      }
      await fs.write(lockAbs, stringifyVarLock(next))
    },
    fs: () => fs,
  }
}
