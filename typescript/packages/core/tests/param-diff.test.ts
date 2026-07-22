import { expect, test } from 'vitest'
import { compareParams } from '../src/param-diff.ts'
import { spanFromOffsets } from '../src/span.ts'

const span = (s: number, e: number) =>
  spanFromOffsets('I should have 3 cukes in my big belly', s, e)

test('all elements equal → every cell ok', () => {
  const diffs = compareParams([3, 'big'], [3, 'big'], [span(14, 15), span(31, 34)], ['3', 'big'])
  expect(diffs.every((d) => d.ok)).toBe(true)
})

test('one mismatching element → that cell is not ok with expected/actual', () => {
  const diffs = compareParams([4, 'big'], [3, 'big'], [span(14, 15), span(31, 34)], ['3', 'big'])
  expect(diffs[0]).toMatchObject({ column: 'cell 1', expected: '3', actual: '4', ok: false })
  expect(diffs[1]).toMatchObject({ column: 'cell 2', ok: true })
})

test('object actuals compare structurally across references', () => {
  const diffs = compareParams([{ iso: 'NO' }], [{ iso: 'NO' }], [span(0, 2)], ['NO'])
  expect(diffs[0]?.ok).toBe(true)
})

test('a mismatching object actual renders as JSON, not [object Object]', () => {
  const money = { currency: 'GBP', value: 2.6 }
  const diffs = compareParams([money], [{ currency: 'GBP', value: 2.55 }], [span(0, 5)], ['£2.55'])
  expect(diffs[0]).toMatchObject({
    expected: '£2.55',
    actual: '{"currency":"GBP","value":2.6}',
    ok: false,
  })
})

test('the parameter type format renders the actual in document notation', () => {
  const format = (v: unknown) => `£${(v as { value: number }).value.toFixed(2)}`
  const diffs = compareParams(
    [{ currency: 'GBP', value: 2.6 }],
    [{ currency: 'GBP', value: 2.55 }],
    [span(0, 5)],
    ['£2.55'],
    [format],
  )
  expect(diffs[0]).toMatchObject({ expected: '£2.55', actual: '£2.60', ok: false, formatted: true })
})

test('without a format the diff is not marked formatted', () => {
  const diffs = compareParams([{ a: 1 }], [{ a: 2 }], [span(0, 1)], ['x'])
  expect(diffs[0]?.formatted).toBe(false)
})

test('a throwing format falls through to the generic rendering', () => {
  const format = () => {
    throw new Error('boom')
  }
  const diffs = compareParams([{ a: 1 }], [{ a: 2 }], [span(0, 1)], ['x'], [format])
  expect(diffs[0]?.actual).toBe('{"a":1}')
})

test('format never affects the verdict', () => {
  const format = () => 'same'
  const diffs = compareParams([1], [2], [span(0, 1)], ['2'], [format])
  expect(diffs[0]).toMatchObject({ expected: '2', actual: 'same', ok: false })
})

test('cells carry the raw values for adapter-side structural diffs', () => {
  const diffs = compareParams([4], [3], [span(14, 15)], ['3'])
  expect(diffs[0]?.expectedValue).toBe(3)
  expect(diffs[0]?.actualValue).toBe(4)
})
