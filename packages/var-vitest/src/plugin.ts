import { existsSync, readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadVarConfig } from '@oselvar/var/node'
import type { Plugin } from 'vite'

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export type VarVitestPluginOptions = {
  readonly cwd?: string
}

export function varVitestPlugin(options: VarVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: ReadonlyArray<string> = []
  // Absolute path to var.config.ts when one exists; the generated virtual
  // module imports it directly so its scannerPlugins reach the runtime.
  let configPath: string | undefined
  return {
    name: '@oselvar/var-vitest',
    async configResolved() {
      const cfg = await loadVarConfig(cwd)
      stepFiles = await findFiles(cwd, cfg.steps)
      for (const name of ['var.config.ts', 'var.config.js', 'var.config.mjs']) {
        const abs = resolve(cwd, name)
        if (existsSync(abs)) {
          configPath = abs
          break
        }
      }
    },
    async load(id) {
      if (!id.endsWith('.var.md')) return null
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
import { runVarSource } from '@oselvar/var-vitest/runtime'
${configImport}
${stepImports}

const SOURCE = ${sourceJson}

runVarSource(SOURCE, ${pathJson}, {
  sink: { example: (name, run) => vitestTest(name, run) },
  reporter: { diagnostic: (d) => vitestTest(\`var:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
  scannerPlugins: varConfig?.scannerPlugins ?? [],
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
