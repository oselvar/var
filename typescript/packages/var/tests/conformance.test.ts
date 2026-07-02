import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalStringify, parse, runConformance } from '@oselvar/var-core'
import { describe, expect, test } from 'vitest'
import {
  _customParameterTypes,
  _resetBuilder,
  buildRegistry,
  contextFactory,
} from '../src/registry.js'

const BUNDLES = resolve(import.meta.dirname, '../../../../conformance/bundles')
const UPDATE = process.env.VAR_UPDATE_GOLDENS === '1'

// 'var-doc' <-> BundleArtifacts['varDoc']; others map name->key directly.
const ARTIFACTS = [
  ['var-doc', 'varDoc'],
  ['registry', 'registry'],
  ['plan', 'plan'],
  ['trace', 'trace'],
] as const

// NOTE: these tests share @oselvar/var module-scope state, so they must
// run sequentially within this file. Do NOT mark them `test.concurrent`.
// Run with `vitest run` (one-shot), NOT watch mode: bundles are loaded via
// dynamic import(), which is cached, so a watch re-run would re-clear the
// builder without re-registering steps and compare against an empty registry.
for (const name of readdirSync(BUNDLES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()) {
  const dir = resolve(BUNDLES, name)
  describe(`conformance: ${name}`, () => {
    test('artifacts match goldens', async () => {
      _resetBuilder()
      for (const f of readdirSync(dir)
        .filter((f) => f.endsWith('.steps.ts'))
        .sort()) {
        await import(pathToFileURL(resolve(dir, f)).href)
      }
      const registry = buildRegistry()
      const createContext = contextFactory()
      const source = readFileSync(resolve(dir, 'example.md'), 'utf8')
      const varDoc = parse('example.md', source)
      const artifacts = await runConformance(
        varDoc,
        registry,
        createContext,
        _customParameterTypes(),
      )

      const goldenDir = resolve(dir, 'golden')
      if (UPDATE && !existsSync(goldenDir)) mkdirSync(goldenDir, { recursive: true })
      if (!UPDATE && !existsSync(goldenDir)) {
        throw new Error(
          `Missing goldens for bundle "${name}" — generate with VAR_UPDATE_GOLDENS=1: ${goldenDir}`,
        )
      }
      for (const [fileName, key] of ARTIFACTS) {
        const json = canonicalStringify(artifacts[key])
        const file = resolve(goldenDir, `${fileName}.json`)
        if (UPDATE) {
          writeFileSync(file, json)
        } else {
          expect(json, `${name}/${fileName}.json`).toBe(readFileSync(file, 'utf8'))
        }
      }
    })
  })
}
