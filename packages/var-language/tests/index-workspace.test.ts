import { expect, test } from 'vitest'
import { buildWorkspaceIndex } from '../src/index-workspace.js'

test('cross-references matched substrings in .var.md to their step defs', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/abs/steps/account.steps.ts',
        source: `step('I have {int} cukes', (ctx, n) => {})
`,
      },
    ],
    varFiles: [
      {
        path: '/abs/belly.var.md',
        source: '# Belly\n\nGiven I have 5 cukes',
      },
    ],
  })
  expect(idx.stepDefs).toHaveLength(1)
  expect(idx.matches).toHaveLength(1)
  const m = idx.matches[0]
  expect(m?.varPath).toBe('/abs/belly.var.md')
  expect(m?.stepDef.expression).toBe('I have {int} cukes')
  // Match starts somewhere inside line 3 (the body).
  expect(m?.range.start.line).toBe(3)
})

test('an unmatched keyword-led sentence produces NO diagnostic (no Given/When/Then heuristic)', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [],
    varFiles: [{ path: '/m.var.md', source: '# M\n\nGiven I have 5 cukes' }],
  })
  expect(idx.diagnostics).toEqual([])
})

test('ambiguous matches surface as ambiguous-match diagnostics', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/s.ts',
        source: `step('I have {int} cukes', () => {})
step('I have {int} {word}', () => {})
`,
      },
    ],
    varFiles: [{ path: '/a.var.md', source: '# Ambig\n\nGiven I have 5 cukes' }],
  })
  const codes = idx.diagnostics.map((d) => d.code)
  expect(codes).toContain('ambiguous-match')
})

test('the index is empty for an empty workspace', () => {
  const idx = buildWorkspaceIndex({ stepFiles: [], varFiles: [] })
  expect(idx.stepDefs).toEqual([])
  expect(idx.matches).toEqual([])
  expect(idx.diagnostics).toEqual([])
})

test('a custom parameter type defined in *.steps.ts is registered before step compilation', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/airports.steps.ts',
        source: `defineParameterType({ name: 'airport', regexp: /[A-Z]{3}/ })
step('I fly to {airport}', (ctx, code) => {})
`,
      },
    ],
    varFiles: [{ path: '/t.var.md', source: '# T\n\nGiven I fly to LHR\n' }],
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
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/yahtzee.steps.ts',
        source: `step('each row lists the dice, the category and the score', (ctx, row) => {})\n`,
      },
    ],
    varFiles: [
      {
        path: '/yahtzee.var.md',
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
})
