import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { VarConfig, VarGlobs } from './config-types.js'
import type { ScannerPlugin } from './scanner.js'

export type { VarConfig, VarGlobs } from './config-types.js'

const DEFAULT_CONFIG: VarConfig = {
  // No default spec glob: specs are plain `.md` files, so a greedy default would
  // parse every README in the repo. A repo must declare `vars` explicitly.
  vars: { include: [], exclude: [] },
  steps: ['**/*.steps.ts'],
  // No default template here — generateSnippet (in @oselvar/var-language)
  // already falls back to its own DEFAULT_SNIPPET_TEMPLATE when no template
  // is supplied. Keeping a second copy of that default here would just be
  // the same value duplicated one layer up, and var-core can't import
  // var-language's snippet-template.ts without creating a backwards
  // dependency (var-language already depends on var-core).
  snippet: {},
  scannerPlugins: [],
}

// `vars` accepts either a plain glob array (include-only shorthand) or an
// explicit `{ include, exclude }`. Both normalise to VarGlobs.
type VarsInput =
  | ReadonlyArray<string>
  | { readonly include?: ReadonlyArray<string>; readonly exclude?: ReadonlyArray<string> }

type UserConfig = {
  readonly vars?: VarsInput
  readonly steps?: ReadonlyArray<string>
  readonly snippet?: { readonly template?: string }
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

function normalizeVars(vars: VarsInput | undefined): VarGlobs {
  if (vars === undefined) return DEFAULT_CONFIG.vars
  if (Array.isArray(vars)) return { include: vars, exclude: [] }
  const obj = vars as { include?: ReadonlyArray<string>; exclude?: ReadonlyArray<string> }
  return { include: obj.include ?? [], exclude: obj.exclude ?? [] }
}

export async function loadVarConfig(cwd: string): Promise<VarConfig> {
  const candidates = ['var.config.ts', 'var.config.js', 'var.config.mjs']
  for (const name of candidates) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    const mod = await import(pathToFileURL(path).href)
    const cfg = (mod.default ?? mod) as UserConfig
    return {
      vars: normalizeVars(cfg.vars),
      steps: cfg.steps ?? DEFAULT_CONFIG.steps,
      snippet: cfg.snippet?.template !== undefined ? { template: cfg.snippet.template } : {},
      scannerPlugins: cfg.scannerPlugins ?? DEFAULT_CONFIG.scannerPlugins,
    }
  }
  return DEFAULT_CONFIG
}
