import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// (kind, expression) and parameter-type extraction across every bundle are
// proven by extraction-conformance.test.ts. This file covers the Rust-specific
// pieces: anchoring the expression to the first argument (so strings inside the
// handler closure aren't mistaken for it) and raw-string regexp handling.
async function rustScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['rust'])
}

describe('rust dialect', () => {
  test('extracts kind + expression from Steps builder calls', async () => {
    const scanner = await rustScanner()
    const src = `pub fn register(r: Registry) -> Registry {
    let mut s = Steps::from_registry(r);
    s.stimulus("I add {int}", file!(), line!(), Handler::sync1(|state, _n| Ok(Some(state))));
    s.sensor("the total is {int}", file!(), line!(), Handler::sync1(|_s, _e| Ok(None)));
    s.into_registry()
}`
    const defs = scanner.discoverStepDefs('x.steps.rs', src)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['stimulus', 'I add {int}'],
      ['sensor', 'the total is {int}'],
    ])
  })

  test('a string inside the handler closure is not mistaken for the expression', async () => {
    const scanner = await rustScanner()
    const src = `fn r() { s.stimulus("real expr", FILE, 1, Handler::sync0(|_s| Err(HandlerError::new("inner")))); }`
    expect(scanner.discoverStepDefs('x.steps.rs', src).map((d) => d.expression)).toEqual([
      'real expr',
    ])
  })

  test('param + param_with_format extract name and regexp; raw strings stay verbatim', async () => {
    const scanner = await rustScanner()
    const src = `fn r() {
    s.param("airport", "[A-Z]{3}", parse);
    s.param_with_format("money", r"£\\d+\\.\\d{2}", parse, format);
}`
    expect(
      scanner.discoverParameterTypes('x.steps.rs', src).map((t) => [t.name, t.regexp]),
    ).toEqual([
      ['airport', '[A-Z]{3}'],
      ['money', '£\\d+\\.\\d{2}'],
    ])
  })
})
