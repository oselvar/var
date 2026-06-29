import { existsSync, readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { partitionGlobs } from '@oselvar/var-core'
import { loadVarConfig } from '@oselvar/var-core/node'
import type { Plugin } from 'vite'

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export type VarVitestPluginOptions = {
  readonly cwd?: string
}

// A file is a var spec iff it was discovered by the configured `vars` globs.
// Vite may append a query suffix (e.g. `?v=123`) to module ids, so strip it
// before matching against the discovered absolute paths.
export function isVarSpecId(id: string, specFiles: ReadonlySet<string>): boolean {
  const path = id.split('?')[0] ?? id
  return specFiles.has(path)
}

export function varVitestPlugin(options: VarVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: ReadonlyArray<string> = []
  // Absolute paths of the spec files discovered from `cfg.vars`. The `load`
  // hook transforms only these into virtual test modules — there is no longer
  // a `.md` extension to key off of.
  let specFiles: ReadonlySet<string> = new Set()
  // Absolute path to var.config.ts when one exists; the generated virtual
  // module imports it directly so its scannerPlugins reach the runtime.
  let configPath: string | undefined
  return {
    name: '@oselvar/var-vitest',
    config() {
      // Force a single @oselvar/var (and @oselvar/var-core) module instance.
      // The authoring API (defineState) and the registry glue
      // (@oselvar/var/registry, used by runtime.ts) MUST share one module so
      // buildRegistry() sees the steps registered via defineState. Under
      // resolve.preserveSymlinks these can split into two instances, leaving
      // an empty registry and zero steps run with no error — so we dedupe.
      return { resolve: { dedupe: ['@oselvar/var', '@oselvar/var-core'] } }
    },
    async configResolved() {
      const cfg = await loadVarConfig(cwd)
      stepFiles = await findFiles(cwd, cfg.steps)
      specFiles = new Set(await findFiles(cwd, cfg.vars))
      for (const name of ['var.config.ts', 'var.config.js', 'var.config.mjs']) {
        const abs = resolve(cwd, name)
        if (existsSync(abs)) {
          configPath = abs
          break
        }
      }
    },
    async load(id) {
      if (!isVarSpecId(id, specFiles)) return null
      const source = readFileSync(id, 'utf8')
      return generateVirtualModule({
        varPath: id,
        stepImports: stepFiles,
        source,
        configPath,
      })
    },
  }
}

export type GenerateInput = {
  readonly varPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
  // Absolute path to a var.config.ts file. When present, the generated
  // virtual module imports it as `varConfig` and forwards its
  // `scannerPlugins` to the runtime.
  readonly configPath?: string | undefined
}

export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const stepImports = input.stepImports.map((p) => `import ${JSON.stringify(p)}`).join('\n')
  const pathJson = JSON.stringify(input.varPath)
  const configImport = input.configPath
    ? `import varConfig from ${JSON.stringify(input.configPath)}`
    : 'const varConfig = {}'
  return `import { test as vitestTest } from 'vitest'
import { runVarSource, toFailure } from '@oselvar/var-vitest/runtime'
${configImport}
${stepImports}

const SOURCE = ${sourceJson}
const PATH = ${pathJson}

runVarSource(SOURCE, PATH, {
  sink: {
    example: (name, run, info) =>
      vitestTest(name, async (ctx) => {
        const lines = info?.lines ?? []
        try {
          await run()
          ctx.task.meta.varResult = { name, status: 'passed', lines }
        } catch (error) {
          ctx.task.meta.varResult = {
            name,
            status: 'failed',
            lines,
            failure: toFailure(error, PATH, lines[0] ?? 0),
          }
          throw error
        }
      }),
  },
  reporter: { diagnostic: (d) => vitestTest(\`var:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
  scannerPlugins: varConfig?.scannerPlugins ?? [],
})
`
}

async function globAbs(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const out: string[] = []
  for (const pattern of patterns) {
    // node:fs/promises.glob is async iterable in Node 22+
    for await (const entry of glob(pattern, { cwd })) {
      out.push(resolve(cwd, entry))
    }
  }
  return out
}

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const { includes, excludes } = partitionGlobs(patterns)
  const excluded = new Set(await globAbs(cwd, excludes))
  const out: string[] = []
  const seen = new Set<string>()
  for (const abs of await globAbs(cwd, includes)) {
    if (excluded.has(abs) || seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
  }
  return out
}
