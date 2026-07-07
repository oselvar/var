import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

async function javaScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['java'])
}

describe('java dialect', () => {
  test('discovers binder method calls with kind, expression, and typed lambda params', async () => {
    const scanner = await javaScanner()
    const source = `public final class AirportsSteps implements StepDefinitions {
    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.steps(() -> new Ctx(null));
        s.stimulus("I fly to {airport}", (Ctx ctx, String dest) -> new Ctx(dest));
        s.sensor("The count is {int}", (Ctx ctx, Integer n) -> null);
    }
}
`
    const defs = scanner.discoverStepDefs('AirportsSteps.java', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['stimulus', 'I fly to {airport}'],
      ['sensor', 'The count is {int}'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'dest', typeText: 'String' },
    ])
  })

  test('handles a bare single-identifier lambda parameter', async () => {
    const scanner = await javaScanner()
    const defs = scanner.discoverStepDefs(
      'XSteps.java',
      `class X { void f(StateBinder<C> s) { s.sensor("plain", g -> g); } }\n`,
    )
    expect(defs[0]?.handlerParams?.params).toEqual([{ name: 'g', typeText: '' }])
  })

  test('decodes escape sequences including \\uXXXX', async () => {
    const scanner = await javaScanner()
    const defs = scanner.discoverStepDefs(
      'XSteps.java',
      `class X { void f(StateBinder<C> s) { s.stimulus("I said \\"hi\\"\\n\\u00e9", (C c) -> c); } }\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\né')
  })

  test('discovers param with Pattern.compile', async () => {
    const scanner = await javaScanner()
    const source = `class X { void f(Registrar registrar) {
        var s = registrar.steps(() -> new Ctx(null));
        s.param("airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0]);
    } }
`
    const types = scanner.discoverParameterTypes('XSteps.java', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([['airport', '[A-Z]{3}']])
  })

  test('ignores unrelated method calls', async () => {
    const scanner = await javaScanner()
    expect(
      scanner.discoverStepDefs(
        'XSteps.java',
        `class X { void f() { log.stimulus(); other("x"); } }\n`,
      ),
    ).toEqual([])
  })
})
