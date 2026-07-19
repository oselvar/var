import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// Direct proof of the C# dialect (before languages.json wires it into the
// cross-language extraction gate): scanning real .steps.cs fixtures yields the
// expected (kind, expression) and (name, regexp) sets.
const BUNDLES = fileURLToPath(new URL('../../../../conformance/bundles', import.meta.url))

function read(bundle: string, file: string): string {
  return readFileSync(`${BUNDLES}/${bundle}/${file}`, 'utf8')
}

describe('csharp tree-sitter dialect', () => {
  test('extracts PascalCase Stimulus/Sensor as lowercase step kinds', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader(), ['csharp'])
    const source = read('02-context-isolation', 'counter.steps.cs')
    const steps = scanner
      .discoverStepDefs('counter.steps.cs', source)
      .map((d) => `${d.kind}|${d.expression}`)
    expect(steps.sort()).toEqual(['sensor|The count is {int}', 'stimulus|I increment'])
  })

  test('extracts a custom parameter type from a verbatim regexp', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader(), ['csharp'])
    const source = read('15-custom-parameter-format', 'money.steps.cs')
    const types = scanner
      .discoverParameterTypes('money.steps.cs', source)
      .map((t) => `${t.name}|${t.regexp}`)
    expect(types).toEqual(['money|£\\d+\\.\\d{2}'])
  })

  test('extracts a custom parameter type from a plain regexp', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader(), ['csharp'])
    const source = read('13-custom-parameter-type', 'airports.steps.cs')
    const types = scanner
      .discoverParameterTypes('airports.steps.cs', source)
      .map((t) => `${t.name}|${t.regexp}`)
    expect(types).toEqual(['airport|[A-Z]{3}'])
  })
})
