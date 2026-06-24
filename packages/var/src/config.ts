import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { VarConfig } from './config-types.js'
import type { ScannerPlugin } from './scanner.js'
import { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'

export type { VarConfig } from './config-types.js'

const DEFAULT_CONFIG: VarConfig = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

type UserConfig = {
  readonly vars?: ReadonlyArray<string>
  readonly steps?: ReadonlyArray<string>
  readonly snippet?: { readonly template?: string }
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

export async function loadVarConfig(cwd: string): Promise<VarConfig> {
  const candidates = ['var.config.ts', 'var.config.js', 'var.config.mjs']
  for (const name of candidates) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    const mod = await import(pathToFileURL(path).href)
    const cfg = (mod.default ?? mod) as UserConfig
    return {
      vars: cfg.vars ?? DEFAULT_CONFIG.vars,
      steps: cfg.steps ?? DEFAULT_CONFIG.steps,
      snippet: {
        template: cfg.snippet?.template ?? DEFAULT_CONFIG.snippet.template,
      },
      scannerPlugins: cfg.scannerPlugins ?? DEFAULT_CONFIG.scannerPlugins,
    }
  }
  return DEFAULT_CONFIG
}
