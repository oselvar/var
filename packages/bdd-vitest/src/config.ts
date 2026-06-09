import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export type BddConfig = {
  readonly bdds: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
}

const DEFAULT_CONFIG: BddConfig = {
  bdds: ['**/*.bdd.md'],
  steps: ['**/*.steps.ts'],
}

export async function loadBddConfig(cwd: string): Promise<BddConfig> {
  const candidates = ['bdd.config.ts', 'bdd.config.js', 'bdd.config.mjs']
  for (const name of candidates) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    const mod = await import(pathToFileURL(path).href)
    const cfg = (mod.default ?? mod) as Partial<BddConfig>
    return {
      bdds: cfg.bdds ?? DEFAULT_CONFIG.bdds,
      steps: cfg.steps ?? DEFAULT_CONFIG.steps,
    }
  }
  return DEFAULT_CONFIG
}
