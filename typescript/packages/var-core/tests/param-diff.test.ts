import { expect, test } from 'vitest'
import { compareParams } from '../src/param-diff.js'
import { spanFromOffsets } from '../src/span.js'

const span = (s: number, e: number) =>
  spanFromOffsets('I should have 3 cukes in my big belly', s, e)

test('all elements equal → every cell ok', () => {
  const diffs = compareParams([3, 'big'], [3, 'big'], [span(14, 15), span(31, 34)], ['3', 'big'])
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('one mismatching element → that cell is not ok with expected/actual', () => {
  const diffs = compareParams([4, 'big'], [3, 'big'], [span(14, 15), span(31, 34)], ['3', 'big'])
  expect(diffs[0]).toMatchObject({ column: 'arg 1', expected: '3', actual: '4', ok: false })
  expect(diffs[1]).toMatchObject({ column: 'arg 2', ok: true })
})

test('object actuals compare structurally across references', () => {
  const diffs = compareParams([{ iso: 'NO' }], [{ iso: 'NO' }], [span(0, 2)], ['NO'])
  expect(diffs[0]?.ok).toBe(true)
})
