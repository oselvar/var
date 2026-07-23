import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { findFiles, loadVarConfig } from '@varar/config'
import { parseVarLock, type SpecBaseline } from '@varar/core'
import type { Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import { discoverStaticExamples, type StaticExample } from './static-examples.ts'

export type VararVitestPluginOptions = {
  readonly cwd?: string
}

// A file is a var spec iff it was discovered by the configured `docs` globs.
// Vite may append a query suffix (e.g. `?v=123`) to module ids, so strip it
// before matching against the discovered absolute paths.
export function isVararSpecId(id: string, specFiles: ReadonlySet<string>): boolean {
  const path = id.split('?')[0] ?? id
  return specFiles.has(path)
}

export function vararVitestPlugin(options: VararVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: ReadonlyArray<string> = []
  // Absolute paths of the spec files discovered from `cfg.docs`. The `load`
  // hook transforms only these into virtual test modules — there is no longer
  // a `.md` extension to key off of.
  let specFiles: ReadonlySet<string> = new Set()
  // Absolute path to varar.config.json when one exists — watched so a config
  // edit re-transforms specs in watch mode.
  let configJsonPath: string | undefined
  // Absolute path to the committed drift baseline (varar.lock.json).
  const lockPath = resolve(cwd, 'varar.lock.json')
  return {
    name: '@varar/vitest',
    async config() {
      // varar.config.json is the single source of truth for which files are specs.
      // Drive vitest's collection from it so an excluded `.md` is never handed
      // to vite as a raw-markdown "script" (which fails to parse). Globs are
      // made absolute against `cwd`; setting `test.exclude` *replaces* vitest's
      // defaults, so re-add `configDefaults.exclude` to keep `node_modules` &c.
      // out.
      const cfg = await loadVarConfig(cwd)
      const abs = (g: string) => resolve(cwd, g)
      return {
        // Force a single @varar/varar (and @varar/core) module instance.
        // The authoring API (steps) and the registry glue
        // (@varar/varar/registry, used by runtime.ts) MUST share one module so
        // buildRegistry() sees the steps registered via steps(). Under
        // resolve.preserveSymlinks these can split into two instances, leaving
        // an empty registry and zero steps run with no error — so we dedupe.
        resolve: { dedupe: ['@varar/varar', '@varar/core'] },
        test: {
          include: cfg.docs.include.map(abs),
          exclude: [...configDefaults.exclude, ...cfg.docs.exclude.map(abs)],
        },
      }
    },
    async configResolved() {
      const cfg = await loadVarConfig(cwd)
      stepFiles = findFiles(cwd, cfg.steps)
      specFiles = new Set(findFiles(cwd, cfg.docs.include, cfg.docs.exclude))
      const abs = resolve(cwd, 'varar.config.json')
      configJsonPath = existsSync(abs) ? abs : undefined
    },
    async load(id) {
      if (!isVararSpecId(id, specFiles)) return null
      const varPath = id.split('?')[0] ?? id
      const source = readFileSync(varPath, 'utf8')
      // The transform result depends on the step definitions (they decide
      // which paragraphs are examples), so a step-file edit must re-transform
      // every spec in watch mode.
      for (const f of stepFiles) this.addWatchFile(f)
      if (configJsonPath) this.addWatchFile(configJsonPath)
      // Editing the baseline re-transforms so the drift gate reflects it.
      this.addWatchFile(lockPath)
      const examples = await discoverStaticExamples({
        varPath,
        source,
        stepFiles: stepFiles.map((path) => ({ path, source: readFileSync(path, 'utf8') })),
      })
      // This spec's baseline entry from varar.lock.json (POSIX path, relative to
      // cwd), injected so the runtime can run the read-only drift gate.
      const specPath = relative(cwd, varPath).split(sep).join('/')
      const lock = existsSync(lockPath) ? parseVarLock(readFileSync(lockPath, 'utf8')) : null
      const baseline = lock?.specs[specPath] ?? null
      return generateVirtualModule({
        varPath,
        stepImports: stepFiles,
        source,
        examples,
        baseline,
      })
    },
  }
}

export type GenerateInput = {
  readonly varPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
  // Statically discovered examples (see discoverStaticExamples). Each one
  // becomes a `test("literal name", ...)` call placed at its own markdown
  // line/column.
  readonly examples?: ReadonlyArray<StaticExample>
  // This spec's drift baseline from varar.lock.json (or null when unbaselined),
  // inlined so the runtime can run the read-only drift gate.
  readonly baseline?: SpecBaseline | null
}

// The generated module preserves an IDENTITY LINE MAPPING to the markdown
// source: all imports and setup are squeezed onto line 1, and each example's
// `test(...)` call sits at the example's own line and column. Runtime stack
// traces (vitest's includeTaskLocation) and editor AST discovery therefore
// point at the right spec line — with a string-literal test name — without
// any source map.
export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const pathJson = JSON.stringify(input.varPath)
  const baselineJson = JSON.stringify(input.baseline ?? null)
  const examples = input.examples ?? []
  const header: string[] = [
    "import { test } from 'vitest'",
    // Everything the generated module needs comes from @varar/vitest —
    // the one package the consumer directly depends on. Importing e.g.
    // @varar/core here would fail under pnpm's strict node_modules
    // layout, because the module id (the spec path) resolves in the
    // consumer's project, where transitive deps are not visible.
    "import { collectVararExamples, vararTestBody } from '@varar/vitest/runtime'",
    ...input.stepImports.map((p) => `import ${JSON.stringify(p)}`),
    `const PATH = ${pathJson}`,
    // Diagnostics and the stale-transform guard register their tests inside
    // collectVararExamples, so the only `test(...)` callsites in this module
    // are the real per-example ones below — static AST discovery sees an
    // exact test tree.
    `const EXAMPLES = collectVararExamples(PATH, ${sourceJson}, { expectedCount: ${examples.length}, baseline: ${baselineJson} })`,
  ]
  const testCall = (ex: StaticExample, i: number): string => {
    const nameJson = JSON.stringify(ex.name)
    return `test(${nameJson}, vararTestBody(EXAMPLES, ${i}, ${nameJson}, PATH))`
  }
  const lastLine = Math.max(1, ...examples.map((e) => e.line))
  const lines: string[] = new Array(lastLine).fill('')
  lines[0] = header.join(';')
  examples.forEach((ex, i) => {
    if (ex.line <= 1) {
      lines[0] += `;${testCall(ex, i)}`
    } else {
      const at = ex.line - 1
      const indented = ' '.repeat(Math.max(0, ex.col - 1)) + testCall(ex, i)
      lines[at] = lines[at] ? `${lines[at]};${testCall(ex, i)}` : indented
    }
  })
  return `${lines.join('\n')}\n`
}
