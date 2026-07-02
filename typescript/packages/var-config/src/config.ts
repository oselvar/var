import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveScannerPlugins } from '@oselvar/var-core'
import type { ParsedVarConfig, VarConfig, VarGlobs } from './config-types.js'

export type { ParsedVarConfig, VarConfig, VarGlobs } from './config-types.js'

const EMPTY_PARSED: ParsedVarConfig = {
  // No default docs OR steps globs: a repo must declare both explicitly.
  // (The old TS-only `**/*.steps.ts` steps default died with the TS-only
  // format — var.config.json is shared with the Python/Java/Kotlin ports.)
  docs: { include: [], exclude: [] },
  steps: [],
  snippets: {},
  scannerPlugins: [],
}

const KNOWN_KEYS = new Set(['$schema', 'docs', 'steps', 'snippets', 'scannerPlugins'])
const KNOWN_DOCS_KEYS = new Set(['include', 'exclude'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringArray(value: unknown, key: string, sourcePath: string): ReadonlyArray<string> {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`${sourcePath}: "${key}" must be an array of strings`)
  }
  return value
}

// Pure. Parses the var.config.json TEXT (no filesystem) so the conformance
// harness and loadVarConfig share one implementation. Fails loudly — a
// typo'd config that silently discovers nothing is the failure mode this
// refuses (see the design spec's error-handling section).
export function parseVarConfig(jsonText: string, sourcePath: string): ParsedVarConfig {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`${sourcePath}: invalid JSON: ${(e as Error).message}`)
  }
  if (!isRecord(data)) throw new Error(`${sourcePath}: top level must be an object`)
  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(
        `${sourcePath}: unknown key "${key}" (known keys: docs, steps, snippets, scannerPlugins)`,
      )
    }
  }
  let docs: VarGlobs = EMPTY_PARSED.docs
  if (data.docs !== undefined) {
    if (!isRecord(data.docs)) throw new Error(`${sourcePath}: "docs" must be an object`)
    for (const key of Object.keys(data.docs)) {
      if (!KNOWN_DOCS_KEYS.has(key)) {
        throw new Error(`${sourcePath}: unknown key "docs.${key}" (known: include, exclude)`)
      }
    }
    docs = {
      include: stringArray(data.docs.include, 'docs.include', sourcePath),
      exclude: stringArray(data.docs.exclude, 'docs.exclude', sourcePath),
    }
  }
  let snippets: Readonly<Record<string, string>> = {}
  if (data.snippets !== undefined) {
    if (
      !isRecord(data.snippets) ||
      !Object.values(data.snippets).every((v) => typeof v === 'string')
    ) {
      throw new Error(`${sourcePath}: "snippets" must be an object of strings`)
    }
    snippets = data.snippets as Record<string, string>
  }
  return {
    docs,
    steps: stringArray(data.steps, 'steps', sourcePath),
    snippets,
    scannerPlugins: stringArray(data.scannerPlugins, 'scannerPlugins', sourcePath),
  }
}

export async function loadVarConfig(cwd: string): Promise<VarConfig> {
  const path = resolve(cwd, 'var.config.json')
  const parsed = existsSync(path) ? parseVarConfig(readFileSync(path, 'utf8'), path) : EMPTY_PARSED
  return {
    docs: parsed.docs,
    steps: parsed.steps,
    snippets: parsed.snippets,
    scannerPlugins: resolveScannerPlugins(parsed.scannerPlugins),
    scannerPluginNames: parsed.scannerPlugins,
  }
}
