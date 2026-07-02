import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

async function kotlinScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['kotlin'])
}

describe('kotlin dialect', () => {
  test('discovers trailing-lambda step calls with kind, expression, and lambda params', async () => {
    const scanner = await kotlinScanner()
    const source = `val steps = defineState(::Ctx) {
    action("I fly to {airport}") { dest: String ->
        copy(dest = dest)
    }
    sensor("The row is checked") { row: Map<String, String> ->
        null
    }
}
`
    const defs = scanner.discoverStepDefs('airports.steps.kt', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['action', 'I fly to {airport}'],
      ['sensor', 'The row is checked'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([{ name: 'dest', typeText: 'String' }])
    expect(defs[1]?.handlerParams?.params).toEqual([
      { name: 'row', typeText: 'Map<String, String>' },
    ])
  })

  test('a zero-parameter lambda (state as receiver) has undefined handlerParams', async () => {
    const scanner = await kotlinScanner()
    const defs = scanner.discoverStepDefs(
      'x.steps.kt',
      `val steps = defineState(::Ctx) {\n    sensor("zero") { dest }\n}\n`,
    )
    expect(defs).toHaveLength(1)
    expect(defs[0]?.handlerParams).toBeUndefined()
  })

  test('decodes escape sequences including \\$ and \\uXXXX', async () => {
    const scanner = await kotlinScanner()
    const defs = scanner.discoverStepDefs(
      'x.steps.kt',
      `val steps = defineState(::Ctx) {\n    action("costs \\$5\\n\\u00e9") { n: Int -> copy() }\n}\n`,
    )
    expect(defs[0]?.expression).toBe('costs $5\né')
  })

  test('discovers parameterType with Regex(...)', async () => {
    const scanner = await kotlinScanner()
    const source = `val steps = defineState(::Ctx) {
    parameterType("airport", Regex("[A-Z]{3}")) { captures -> captures[0].lowercase() }
    action("I fly to {airport}") { dest: String -> copy(dest = dest) }
}
`
    const types = scanner.discoverParameterTypes('x.steps.kt', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([['airport', '[A-Z]{3}']])
  })

  test('ignores non-step trailing-lambda calls', async () => {
    const scanner = await kotlinScanner()
    expect(
      scanner.discoverStepDefs('x.steps.kt', `val x = listOf("a").map { it }\nfun other() {}\n`),
    ).toEqual([])
  })
})
