import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalStringify } from '@varar/core'
import { expect, test } from 'vitest'
import { parseVarConfig } from '../src/config.ts'

// tests/ -> var-config -> packages -> typescript -> repo root. (import.meta.url,
// not __dirname — this is an ESM package and vitest runs test files as ESM.)
const CASES_DIR = fileURLToPath(new URL('../../../../conformance/config/cases', import.meta.url))

const EMPTY = { docs: { include: [], exclude: [] }, steps: [], snippets: {} }

for (const name of readdirSync(CASES_DIR).sort()) {
  const dir = join(CASES_DIR, name)
  const configPath = join(dir, 'varar.config.json')
  if (existsSync(join(dir, 'expect-error.txt'))) {
    test(`config conformance: ${name} fails to parse`, () => {
      expect(() => parseVarConfig(readFileSync(configPath, 'utf8'), configPath)).toThrowError()
    })
  } else {
    test(`config conformance: ${name} matches golden`, () => {
      const parsed = existsSync(configPath)
        ? parseVarConfig(readFileSync(configPath, 'utf8'), configPath)
        : EMPTY
      const actual = canonicalStringify({
        docs: { include: parsed.docs.include, exclude: parsed.docs.exclude },
        steps: parsed.steps,
        snippets: parsed.snippets,
      })
      expect(actual).toBe(readFileSync(join(dir, 'golden.json'), 'utf8'))
    })
  }
}
