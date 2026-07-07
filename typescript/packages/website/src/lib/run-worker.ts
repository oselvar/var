import * as varRuntime from '@oselvar/var'
import { _resetBuilder } from '@oselvar/var/registry'
import * as varCore from '@oselvar/var-core'
import { type Drift, hashSource, type SpecResults } from '@oselvar/var-core'
import * as ts from 'typescript'
import { createMemoryBaselineStore } from './memory-baseline-store.ts'
import { runRegisteredSpec } from './run-spec.ts'

type RunInput = {
  varPath: string
  varSource: string
  stepFiles: ReadonlyArray<{ path: string; source: string }>
  exampleIndex?: number
  update?: boolean
}

// One baseline store for the whole page (all specs keyed inside var.lock.json),
// living as long as the worker. Drift is measured against it across edits.
const baselineStore = createMemoryBaselineStore()
// Mirrors run-client.ts's WorkerRequest/WorkerResponse — the requestId lets
// the client (a single worker shared by every editor group on the page)
// match each response back to the call that made it, since runs from
// different groups can be in flight concurrently.
type WorkerRequest = RunInput & { requestId: number }

type SourceFile = { readonly path: string; readonly source: string }

// A tiny CommonJS loader over the in-editor files. Bare specifiers map to the
// bundled runtime; relative specifiers resolve against the other provided
// files, so a steps file can `import { score } from './yahtzee'` and get the
// live contents of the yahtzee.ts editor tab.
function createModuleLoader(files: ReadonlyArray<SourceFile>) {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const cache = new Map<string, Record<string, unknown>>()

  const resolveRelative = (spec: string, fromPath: string): SourceFile | undefined => {
    // Normalize ./ and ../ segments against the importer's directory.
    const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : ''
    const segments: string[] = []
    for (const seg of `${dir}${spec}`.split('/')) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') segments.pop()
      else segments.push(seg)
    }
    const path = segments.join('/')
    for (const candidate of [path, `${path}.ts`, path.replace(/\.js$/, '.ts')]) {
      const file = byPath.get(candidate)
      if (file) return file
    }
    return undefined
  }

  const load = (file: SourceFile): Record<string, unknown> => {
    const cached = cache.get(file.path)
    if (cached) return cached
    const js = ts.transpileModule(file.source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: file.path,
    }).outputText
    const require = (spec: string): unknown => {
      if (spec === '@oselvar/var' || spec === '@oselvar/var-vitest') return varRuntime
      if (spec === '@oselvar/var-core') return varCore
      if (spec.startsWith('.')) {
        const target = resolveRelative(spec, file.path)
        if (target) return load(target)
      }
      throw new Error(
        `Cannot import "${spec}" in the browser runner — import steps() from "@oselvar/var", or add the imported file to this editor.`,
      )
    }
    const mod = { exports: {} as Record<string, unknown> }
    // Registered before execution so import cycles see the partial exports
    // instead of recursing forever.
    cache.set(file.path, mod.exports)
    // `//# sourceURL` makes @oselvar/var's stack-based callerLocation see the real path.
    new Function('require', 'exports', 'module', `${js}\n//# sourceURL=${file.path}`)(
      require,
      mod.exports,
      mod,
    )
    // A module may reassign module.exports wholesale; re-register the final value.
    cache.set(file.path, mod.exports)
    return mod.exports
  }

  return { load }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { requestId, ...input } = e.data
  let results: SpecResults
  let drifts: ReadonlyArray<Drift> = []
  try {
    _resetBuilder()
    const loader = createModuleLoader(input.stepFiles)
    // Only .steps.ts files run eagerly (they register steps as a side effect);
    // plain .ts library files load lazily when a steps file imports them.
    for (const f of input.stepFiles) if (f.path.endsWith('.steps.ts')) loader.load(f)
    const outcome = await runRegisteredSpec(input.varPath, input.varSource, {
      exampleIndex: input.exampleIndex,
      baselineStore,
      update: input.update,
    })
    results = outcome.results
    drifts = outcome.drifts
  } catch (err) {
    const e2 = err as Error
    results = {
      version: 1,
      specPath: input.varPath,
      sourceHash: hashSource(input.varSource),
      examples: [
        {
          name: 'run error',
          status: 'failed',
          lines: [1],
          failure: {
            line: 1,
            message: e2?.message ?? String(err),
            stack: e2?.stack ?? String(err),
          },
        },
      ],
    }
  }
  ;(self as unknown as Worker).postMessage({ requestId, results, drifts })
}
