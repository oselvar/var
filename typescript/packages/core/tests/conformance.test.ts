import { expect, test } from 'vitest'
import { CellMismatchError } from '../src/cell-diff.ts'
import {
  canonicalStringify,
  runConformance,
  toFailureArtifact,
  toPlanArtifact,
  toRegistryArtifact,
  toVarDocArtifact,
} from '../src/conformance.ts'
import { compareDocString } from '../src/doc-string-diff.ts'
import { UnexpectedPassError } from '../src/execute.ts'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry, defineParameterType } from '../src/registry.ts'

test('canonicalStringify sorts keys recursively and ends with a newline', () => {
  const out = canonicalStringify({ b: 1, a: { d: 2, c: 3 } })
  expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n')
})

test('canonicalStringify preserves array order', () => {
  expect(canonicalStringify([3, 1, 2])).toBe('[\n  3,\n  1,\n  2\n]\n')
})

const matchSpan = { startOffset: 0, endOffset: 1, startLine: 7, startCol: 1, endLine: 7, endCol: 2 }
const cellSpan = {
  startOffset: 30,
  endOffset: 33,
  startLine: 9,
  startCol: 3,
  endLine: 9,
  endCol: 6,
}

test('toFailureArtifact projects a CellMismatchError, anchored at the first failing cell', () => {
  const err = new CellMismatchError([
    { column: 'score', span: cellSpan, expected: '9', actual: '6', ok: false },
  ])
  expect(toFailureArtifact(err, matchSpan)).toEqual({
    kind: 'cell-mismatch',
    line: 7,
    anchor: cellSpan,
    message: 'score: expected 9 but was 6',
    cells: [{ column: 'score', expected: '9', actual: '6', span: cellSpan }],
  })
})

test('toFailureArtifact projects a doc-string cell as a cell mismatch', () => {
  const diff = compareDocString('b', 'a', cellSpan)
  expect(toFailureArtifact(new CellMismatchError([diff!]), matchSpan)).toEqual({
    kind: 'cell-mismatch',
    line: 7,
    anchor: cellSpan,
    message: 'doc string: expected "a" but was "b"',
    cells: [{ column: 'doc string', expected: '"a"', actual: '"b"', span: cellSpan }],
  })
})

test('toFailureArtifact maps UnexpectedPassError and opaque throws', () => {
  expect(toFailureArtifact(new UnexpectedPassError(), matchSpan).kind).toBe('unexpected-pass')
  expect(toFailureArtifact(new Error('boom'), matchSpan)).toEqual({
    kind: 'thrown',
    line: 7,
    anchor: matchSpan,
  })
})

test('toFailureArtifact takes line and anchor from the matchSpan, never the stack', () => {
  // No stack scraping: both are source positions derived from the span the
  // caller passes, so every language port reproduces them.
  const err = new Error('boom')
  err.stack = 'Error: boom\n    at handler (s.ts:1:1)\n    at step (e.md:42:7)'
  expect(toFailureArtifact(err, matchSpan)).toEqual({
    kind: 'thrown',
    line: 7,
    anchor: matchSpan,
  })
})

test('toRegistryArtifact lists expressions and parsed parameter-type names', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  expect(toRegistryArtifact(r)).toEqual({
    steps: [{ expression: 'I have {int} cukes', parameterTypeNames: ['int'] }],
    parameterTypes: [],
  })
})

test('toRegistryArtifact reads parameter names from the AST, ignoring escaped braces', () => {
  // A naive `{...}` regex would wrongly count the escaped `\{a, b\}` as a
  // parameter and yield ['a, b', 'int']; the AST sees only the real {int}.
  const r = addStep(createRegistry(), {
    expression: 'the set \\{a, b\\} has {int} elements',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  expect(toRegistryArtifact(r).steps[0]?.parameterTypeNames).toEqual(['int'])
})

test('toRegistryArtifact projects passed custom parameter types', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'airport', regexp: /[A-Z]{3}/ })
  r = addStep(r, {
    expression: 'I fly to {airport}',
    expressionSourceFile: 'airports.steps',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  expect(toRegistryArtifact(r, [{ name: 'airport', regexp: '[A-Z]{3}' }])).toEqual({
    steps: [{ expression: 'I fly to {airport}', parameterTypeNames: ['airport'] }],
    parameterTypes: [{ name: 'airport', regexp: '[A-Z]{3}' }],
  })
})

test('toPlanArtifact projects examples, expectedOutcome and stringified args', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const art = toPlanArtifact(plan(parse('e.md', '# A\n\nI have 5 cukes.'), r))
  expect(art.examples[0]?.expectedOutcome).toBe('pass')
  expect(art.examples[0]?.steps[0]?.matchedExpression).toBe('I have {int} cukes')
  expect(art.examples[0]?.steps[0]?.args).toEqual([{ value: '5', parameterType: 'int' }])
})

test('toVarDocArtifact keeps path, examples and orphanAttachments', () => {
  const art = toVarDocArtifact(parse('e.md', '# A\n\nI have 5 cukes.'))
  expect(art.path).toBe('e.md')
  expect(Array.isArray(art.examples)).toBe(true)
})

test('toPlanArtifact projects diagnostics to portable fields (no message/path)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have 5 cukes',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 2,
    kind: 'stimulus',
    handler: () => {},
  })
  const art = toPlanArtifact(plan(parse('e.md', '# A\n\nI have 5 cukes.'), r))
  expect(art.diagnostics).toHaveLength(1)
  expect(art.diagnostics[0]).not.toHaveProperty('message')
  expect(art.diagnostics[0]?.code).toBe('ambiguous-match')
  expect(JSON.stringify(art.diagnostics[0])).not.toContain('/abs/')
})

test('runConformance: passing example yields pass steps with structural contextKey', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  const out = await runConformance(parse('e.md', '# A\n\nI have 5 cukes.'), r, () => ({}))
  expect(out.trace.examples[0]).toEqual({
    name: 'I have 5 cukes',
    outcome: 'pass',
    steps: [
      {
        exampleName: 'I have 5 cukes',
        ordinal: 1,
        stepText: 'I have 5 cukes',
        matchedExpression: 'I have {int} cukes',
        contextKey: { exampleName: 'I have 5 cukes', stepFile: 's' },
        outcome: 'pass',
      },
    ],
  })
})

test('runConformance: expected-failure example reads pass but the step carries the failure', async () => {
  const r = addStep(createRegistry(), {
    expression: 'I divide {int} by {int}',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: (_c, _a, b) => {
      if (b === 0) throw new Error('division by zero')
    },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const out = await runConformance(parse('e.md', src), r, () => ({}))
  const ex = out.trace.examples[0]
  expect(ex?.outcome).toBe('pass')
  expect(ex?.steps[0]?.outcome).toBe('fail')
  expect(ex?.steps[0]?.failure?.kind).toBe('thrown')
})
