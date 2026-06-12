import { existsSync, readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadBddConfig } from '@oselvar/bdd'
import type { Plugin } from 'vite'

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export type BddVitestPluginOptions = {
  readonly cwd?: string
}

export function bddVitestPlugin(options: BddVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: ReadonlyArray<string> = []
  // Absolute path to bdd.config.ts when one exists; the generated virtual
  // module imports it directly so its scannerPlugins reach the runtime.
  let configPath: string | undefined
  return {
    name: '@oselvar/bdd-vitest',
    async configResolved() {
      const cfg = await loadBddConfig(cwd)
      stepFiles = await findFiles(cwd, cfg.steps)
      for (const name of ['bdd.config.ts', 'bdd.config.js', 'bdd.config.mjs']) {
        const abs = resolve(cwd, name)
        if (existsSync(abs)) {
          configPath = abs
          break
        }
      }
    },
    async load(id) {
      if (!id.endsWith('.bdd.md')) return null
      const source = readFileSync(id, 'utf8')
      return generateVirtualModule({
        bddPath: id,
        stepImports: stepFiles,
        source,
        configPath,
      })
    },
  }
}

export type GenerateInput = {
  readonly bddPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
  // Absolute path to a bdd.config.ts file. When present, the generated
  // virtual module imports it as `bddConfig` and forwards its
  // `scannerPlugins` to the runtime.
  readonly configPath?: string | undefined
}

export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const stepImports = input.stepImports.map((p) => `import ${JSON.stringify(p)}`).join('\n')
  const pathJson = JSON.stringify(input.bddPath)
  const configImport = input.configPath
    ? `import bddConfig from ${JSON.stringify(input.configPath)}`
    : 'const bddConfig = {}'
  return `import { test as vitestTest } from 'vitest'
import { runBddSource } from '@oselvar/bdd-vitest/runtime'
${configImport}
${stepImports}

const SOURCE = ${sourceJson}

runBddSource(SOURCE, ${pathJson}, {
  sink: { example: (name, run) => vitestTest(name, run) },
  reporter: { diagnostic: (d) => vitestTest(\`bdd:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
  scannerPlugins: bddConfig?.scannerPlugins ?? [],
})
`
}

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  for (const pattern of patterns) {
    // node:fs/promises.glob is async iterable in Node 22+
    for await (const entry of glob(pattern, { cwd })) {
      const abs = resolve(cwd, entry)
      if (!seen.has(abs)) {
        seen.add(abs)
        out.push(abs)
      }
    }
  }
  return out
}
