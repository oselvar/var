import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

async function pythonScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['python'])
}

describe('python dialect', () => {
  test('discovers decorated step defs with kind, expression, and handler params', async () => {
    const scanner = await pythonScanner()
    const source = `from var import steps

param, stimulus, sensor = steps(lambda: {})


@stimulus("I fly to {airport}")
def _(state, dest):
    return {"dest": dest}


@sensor("The count is {int}")
def _(state, n: int, row=None):
    pass
`
    const defs = scanner.discoverStepDefs('a.steps.py', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['stimulus', 'I fly to {airport}'],
      ['sensor', 'The count is {int}'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'dest', typeText: '' },
    ])
    expect(defs[1]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'n', typeText: 'int' },
      { name: 'row', typeText: '' },
    ])
  })

  test('decodes escapes; leaves unknown escapes backslashed like Python does', async () => {
    const scanner = await pythonScanner()
    const defs = scanner.discoverStepDefs(
      'a.steps.py',
      `@stimulus("I said \\"hi\\"\\n\\ttwice \\u00e9\\a\\z")\ndef _(state):\n    pass\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\n\ttwice é\u0007\\z')
  })

  test('discovers parameter types from string, raw-string, and re.compile regexps', async () => {
    const scanner = await pythonScanner()
    const source = `import re
from var import steps

param, stimulus, sensor = steps(lambda: {})
param("airport", "[A-Z]{3}", parse=lambda code: code.lower())
param("iata", r"[A-Z]{3}\\d")
param("code", re.compile(r"[0-9]+"))
`
    const types = scanner.discoverParameterTypes('a.steps.py', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([
      ['airport', '[A-Z]{3}'],
      ['iata', '[A-Z]{3}\\d'],
      ['code', '[0-9]+'],
    ])
  })

  test('ignores non-step decorators and bare calls', async () => {
    const scanner = await pythonScanner()
    const source = `@other("not a step")
def _(state):
    pass


action = "shadowed"
`
    expect(scanner.discoverStepDefs('a.steps.py', source)).toEqual([])
  })

  test('a .py file scanned by a scanner without the python dialect yields []', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader(), ['typescript'])
    expect(scanner.discoverStepDefs('a.steps.py', '@stimulus("x")\ndef _(s):\n    pass\n')).toEqual(
      [],
    )
  })
})
