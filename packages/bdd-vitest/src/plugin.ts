import { readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { loadBddConfig } from './config.js'

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
  return {
    name: '@oselvar/bdd-vitest',
    async configResolved() {
      const cfg = await loadBddConfig(cwd)
      stepFiles = await findFiles(cwd, cfg.steps)
    },
    async load(id) {
      if (!id.endsWith('.bdd.md')) return null
      const source = readFileSync(id, 'utf8')
      return generateVirtualModule({ bddPath: id, stepImports: stepFiles, source })
    },
  }
}

export type GenerateInput = {
  readonly bddPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
}

export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const stepImports = input.stepImports.map((p) => `import '${p}'`).join('\n')
  const pathLiteral = `'${input.bddPath}'`
  return `import { test as vitestTest } from 'vitest'
import { runBddSource } from '@oselvar/bdd-vitest/runtime'
${stepImports}

const SOURCE = ${sourceJson}

runBddSource(SOURCE, ${pathLiteral}, {
  sink: { example: (name, run) => vitestTest(name, run) },
  reporter: { diagnostic: (d) => vitestTest(\`bdd:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
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
