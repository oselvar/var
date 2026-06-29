import { expect, test } from 'vitest'
import { CellMismatchError } from '../src/cell-diff.js'
import {
  canonicalStringify,
  runConformance,
  toFailureArtifact,
  toPlanArtifact,
  toRegistryArtifact,
  toVarDocArtifact,
} from '../src/conformance.js'
import { DocStringMismatchError } from '../src/doc-string-diff.js'
import { UnexpectedPassError } from '../src/execute.js'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { addStep, createRegistry } from '../src/registry.js'

test('canonicalStringify sorts keys recursively and ends with a newline', () => {
  const out = canonicalStringify({ b: 1, a: { d: 2, c: 3 } })
  expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n')
})

test('canonicalStringify preserves array order', () => {
  expect(canonicalStringify([3, 1, 2])).toBe('[\n  3,\n  1,\n  2\n]\n')
})

const span = { startOffset: 0, endOffset: 1, startLine: 7, startCol: 1, endLine: 7, endCol: 2 }

test('toFailureArtifact projects a CellMismatchError to cell-mismatch', () => {
  const err = new CellMismatchError([
    { column: 'score', span, expected: '9', actual: '6', ok: false },
  ])
  expect(toFailureArtifact(err, 7)).toEqual({
    kind: 'cell-mismatch',
    line: 7,
    cells: [{ column: 'score', expected: '9', actual: '6', span }],
  })
})

test('toFailureArtifact projects a DocStringMismatchError to doc-string-mismatch', () => {
  const err = new DocStringMismatchError({ span, expected: 'a', actual: 'b' })
  expect(toFailureArtifact(err, 7)).toEqual({
    kind: 'doc-string-mismatch',
    line: 7,
    diff: { expected: 'a', actual: 'b', span },
  })
})

test('toFailureArtifact maps UnexpectedPassError and opaque throws', () => {
  expect(toFailureArtifact(new UnexpectedPassError(), 4).kind).toBe('unexpected-pass')
  expect(toFailureArtifact(new Error('boom'), 4)).toEqual({ kind: 'thrown', line: 4 })
})

test('toFailureArtifact uses the line it is given verbatim (the step matchSpan line)', () => {
  // No stack scraping: the failing line is the source position the caller
  // passes (matchSpan.startLine), so every language port reproduces it.
  const err = new Error('boom')
  err.stack = 'Error: boom\n    at handler (s.ts:1:1)\n    at step (e.var.md:42:7)'
  expect(toFailureArtifact(err, 4)).toEqual({ kind: 'thrown', line: 4 })
})

test('toRegistryArtifact lists expressions and parsed parameter-type names', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
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
    kind: 'action',
    handler: () => {},
  })
  expect(toRegistryArtifact(r).steps[0]?.parameterTypeNames).toEqual(['int'])
})

test('toPlanArtifact projects examples, expectedOutcome and stringified args', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  const art = toPlanArtifact(plan(parse('e.var.md', '# A\n\nI have 5 cukes.'), r))
  expect(art.examples[0]?.expectedOutcome).toBe('pass')
  expect(art.examples[0]?.steps[0]?.matchedExpression).toBe('I have {int} cukes')
  expect(art.examples[0]?.steps[0]?.args).toEqual([{ value: '5', parameterType: 'int' }])
})

test('toVarDocArtifact keeps path, examples and orphanAttachments', () => {
  const art = toVarDocArtifact(parse('e.var.md', '# A\n\nI have 5 cukes.'))
  expect(art.path).toBe('e.var.md')
  expect(Array.isArray(art.examples)).toBe(true)
})

test('toPlanArtifact projects diagnostics to portable fields (no message/path)', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 1,
    kind: 'action',
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have 5 cukes',
    expressionSourceFile: '/abs/s.ts',
    expressionSourceLine: 2,
    kind: 'action',
    handler: () => {},
  })
  const art = toPlanArtifact(plan(parse('e.var.md', '# A\n\nI have 5 cukes.'), r))
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
    kind: 'action',
    handler: () => {},
  })
  const out = await runConformance(parse('e.var.md', '# A\n\nI have 5 cukes.'), r, () => ({}))
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
    kind: 'action',
    handler: (_c, _a, b) => {
      if (b === 0) throw new Error('division by zero')
    },
  })
  const src = '# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n'
  const out = await runConformance(parse('e.var.md', src), r, () => ({}))
  const ex = out.trace.examples[0]
  expect(ex?.outcome).toBe('pass')
  expect(ex?.steps[0]?.outcome).toBe('fail')
  expect(ex?.steps[0]?.failure?.kind).toBe('thrown')
})
