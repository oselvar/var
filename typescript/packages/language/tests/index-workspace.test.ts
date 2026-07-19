import { beforeAll, expect, test } from 'vitest'
import { buildWorkspaceIndex, type WorkspaceInput } from '../src/index-workspace.ts'
import type { StepDefScanner } from '../src/scanner.ts'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

let scanner: StepDefScanner

beforeAll(async () => {
  scanner = await createTreeSitterScanner(createTestGrammarLoader())
})

// Every test drives the same tree-sitter scanner — extraction is the shell
// edge's job, so the index builder just consumes it.
function build(input: Omit<WorkspaceInput, 'scanner'>) {
  return buildWorkspaceIndex({ ...input, scanner })
}

test('cross-references matched substrings in .md to their step defs', () => {
  const idx = build({
    stepFiles: [
      {
        path: '/abs/steps/account.steps.ts',
        source: `stimulus('I have {int} cukes', (ctx, n) => {})
`,
      },
    ],
    varFiles: [
      {
        path: '/abs/belly.md',
        source: '# Belly\n\nGiven I have 5 cukes',
      },
    ],
  })
  expect(idx.stepDefs).toHaveLength(1)
  expect(idx.matches).toHaveLength(1)
  const m = idx.matches[0]
  expect(m?.varPath).toBe('/abs/belly.md')
  expect(m?.stepDef.expression).toBe('I have {int} cukes')
  // Match starts somewhere inside line 3 (the body).
  expect(m?.range.start.line).toBe(3)
})

test('an unmatched keyword-led sentence produces NO diagnostic (no Given/When/Then heuristic)', () => {
  const idx = build({
    stepFiles: [],
    varFiles: [{ path: '/m.md', source: '# M\n\nGiven I have 5 cukes' }],
  })
  expect(idx.diagnostics).toEqual([])
})

test('ambiguous matches surface as ambiguous-match diagnostics', () => {
  const idx = build({
    stepFiles: [
      {
        path: '/s.ts',
        source: `stimulus('I have {int} cukes', () => {})
stimulus('I have {int} {word}', () => {})
`,
      },
    ],
    varFiles: [{ path: '/a.md', source: '# Ambig\n\nGiven I have 5 cukes' }],
  })
  const codes = idx.diagnostics.map((d) => d.code)
  expect(codes).toContain('ambiguous-match')
})

test('the index is empty for an empty workspace', () => {
  const idx = build({ stepFiles: [], varFiles: [] })
  expect(idx.stepDefs).toEqual([])
  expect(idx.matches).toEqual([])
  expect(idx.diagnostics).toEqual([])
})

test('a custom parameter type defined in *.steps.ts is registered before step compilation', () => {
  const idx = build({
    stepFiles: [
      {
        path: '/airports.steps.ts',
        source: `const { stimulus } = steps(() => ({})).param('airport', /[A-Z]{3}/)
stimulus('I fly to {airport}', (ctx, code) => {})
`,
      },
    ],
    varFiles: [{ path: '/t.md', source: '# T\n\nGiven I fly to LHR\n' }],
  })
  expect(idx.matches).toHaveLength(1)
  expect(idx.matches[0]?.stepDef.expression).toBe('I fly to {airport}')
  // The matched substring covers "I fly to LHR", not just one word.
  const m = idx.matches[0]!
  expect(m.range.end.character - m.range.start.character).toBeGreaterThan(5)
  // Custom parameter type is in the returned registry.
  const names = [...idx.registry.parameterTypes.parameterTypes].map((p) => p.name)
  expect(names).toContain('airport')
})

test('a header-bound table highlights the binding paragraph with header words as parameters', () => {
  const idx = build({
    stepFiles: [
      {
        path: '/yahtzee.steps.ts',
        source: `stimulus('each row lists the dice, the category and the score', (ctx, row) => {})\n`,
      },
    ],
    varFiles: [
      {
        path: '/yahtzee.md',
        source: `# Yahtzee

each row lists the dice, the category and the score:

| dice          | category   | score |
| ------------- | ---------- | ----- |
| 3, 3, 3, 4, 4 | full house | 17    |
| 3, 3, 3, 3, 3 | Yahtzee    | 50    |`,
      },
    ],
  })
  // One match — the binding paragraph — not one per data row.
  expect(idx.matches).toHaveLength(1)
  const m = idx.matches[0]!
  expect(m.stepDef.expression).toBe('each row lists the dice, the category and the score')
  expect(m.range.start.line).toBe(3) // the paragraph, not a table row
  // The three header cells are painted as parameters inside the paragraph.
  expect(m.paramValues).toEqual(['dice', 'category', 'score'])
  // The table's own header cells are also carried, so editors can highlight
  // them the same way as the paragraph words.
  expect(m.headerCellRanges).toHaveLength(3)
  // Header row is line 5 (1-based): below the paragraph, above the data rows.
  expect(m.headerCellRanges?.every((r) => r.start.line === 5)).toBe(true)
})

test('a plain (non-header-bound) match carries no headerCellRanges', () => {
  const idx = build({
    stepFiles: [
      { path: '/s.steps.ts', source: `stimulus('I have {int} cukes', (ctx, n) => {})\n` },
    ],
    varFiles: [{ path: '/b.md', source: '# Belly\n\nGiven I have 5 cukes' }],
  })
  expect(idx.matches[0]?.headerCellRanges).toBeUndefined()
})
