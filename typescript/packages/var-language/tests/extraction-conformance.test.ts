import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

// ADR 0001's "per-language fixtures, shared expectations" applied to the
// extraction seam: for every conformance bundle, each language's steps
// fixture must yield the IDENTICAL (kind, expression) set — and, where
// present, the identical parameter-type (name, regexp) set. TypeScript is
// the reference; the other three are compared against it.
const BUNDLES_DIR = fileURLToPath(new URL('../../../../conformance/bundles', import.meta.url))

const FIXTURE_MATCHERS: ReadonlyArray<readonly [string, (f: string) => boolean]> = [
  ['typescript', (f) => f.endsWith('.steps.ts')],
  ['python', (f) => f.endsWith('.steps.py')],
  ['java', (f) => f.endsWith('Steps.java')],
  ['kotlin', (f) => f.endsWith('.steps.kt')],
]

const bundles = readdirSync(BUNDLES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

describe('extraction conformance across languages', () => {
  for (const bundle of bundles) {
    test(bundle, async () => {
      const scanner = await createTreeSitterScanner(createTestGrammarLoader(), [
        'typescript',
        'python',
        'java',
        'kotlin',
      ])
      const dir = join(BUNDLES_DIR, bundle)
      const files = readdirSync(dir)
      const byLanguage = new Map<string, { steps: string[]; types: string[] }>()
      for (const [language, matches] of FIXTURE_MATCHERS) {
        const fixtures = files.filter(matches).sort()
        expect(fixtures, `${bundle}: missing ${language} fixture`).not.toHaveLength(0)
        const steps: string[] = []
        const types: string[] = []
        for (const fixture of fixtures) {
          const source = readFileSync(join(dir, fixture), 'utf8')
          for (const d of scanner.discoverStepDefs(fixture, source)) {
            steps.push(`${d.kind}|${d.expression}`)
          }
          for (const t of scanner.discoverParameterTypes(fixture, source)) {
            types.push(`${t.name}|${t.regexp}`)
          }
        }
        byLanguage.set(language, { steps: steps.sort(), types: types.sort() })
      }
      const reference = byLanguage.get('typescript')
      for (const [language, actual] of byLanguage) {
        expect(actual.steps, `${bundle}: ${language} step set differs from typescript`).toEqual(
          reference?.steps,
        )
        expect(actual.types, `${bundle}: ${language} param-type set differs`).toEqual(
          reference?.types,
        )
      }
      // The corpus itself must be non-trivial: every bundle defines steps,
      // and bundle 13 defines the {airport} parameter type.
      expect(reference?.steps.length).toBeGreaterThan(0)
      if (bundle === '13-custom-parameter-type') {
        expect(reference?.types).toEqual(['airport|[A-Z]{3}'])
      }
    })
  }
})
