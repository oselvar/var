import { expect, test } from 'vitest'
import { ambiguousMatch } from '../src/diagnostics.js'
import { spanFromOffsets } from '../src/span.js'

test('ambiguousMatch builds a diagnostic listing all candidates', () => {
  const span = spanFromOffsets('I have 5 cukes in my belly', 0, 26)
  const diag = ambiguousMatch({
    text: 'I have 5 cukes in my belly',
    span,
    candidates: [
      { expression: 'I have {int} cukes in my belly', sourceFile: 'a.ts', sourceLine: 3 },
      { expression: 'I have {int} {word} in my belly', sourceFile: 'a.ts', sourceLine: 8 },
    ],
  })
  expect(diag.severity).toBe('error')
  expect(diag.code).toBe('ambiguous-match')
  expect(diag.message).toContain('Ambiguous step')
  expect(diag.message).toContain('I have {int} cukes in my belly')
  expect(diag.message).toContain('I have {int} {word} in my belly')
  expect(diag.span).toEqual(span)
})
