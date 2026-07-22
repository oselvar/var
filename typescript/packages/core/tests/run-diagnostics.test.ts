import { expect, test } from 'vitest'
import { hashSource } from '../src/hash.ts'
import type { SpecResults } from '../src/result.ts'
import { runResultDiagnostics } from '../src/run-diagnostics.ts'

function results(source: string, examples: SpecResults['examples']): SpecResults {
  return { version: 1, specPath: 's.md', sourceHash: hashSource(source), examples }
}

test('cell mismatch → one diagnostic per cell with expected/actual message', () => {
  const source = 'x 6 y'
  const r = results(source, [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 2, to: 3, message: 'expected 6 but was 50' },
  ])
})

test('whole-table mismatch yields multiple cell diagnostics', () => {
  const source = 'a 1 b 2 c'
  const r = results(source, [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: {
        line: 1,
        message: 'm',
        stack: 's',
        cells: [
          { from: 2, to: 3, actual: '9' },
          { from: 6, to: 7, actual: '8' },
        ],
      },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 2, to: 3, message: 'expected 1 but was 9' },
    { from: 6, to: 7, message: 'expected 2 but was 8' },
  ])
})

test('doc-string cell mismatch → one diagnostic on the body span', () => {
  const source = 'say:\nHello!\n'
  const r = results(source, [
    {
      name: 'd',
      status: 'failed',
      lines: [2],
      failure: { line: 2, message: 'm', stack: 's', cells: [{ from: 5, to: 11, actual: 'Bye' }] },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 5, to: 11, message: 'expected Hello! but was Bye' },
  ])
})

test('plain throw (no cells/doc) → one diagnostic spanning the failing line, with the error message', () => {
  const source = 'line one\nline two\nline three'
  const r = results(source, [
    { name: 'p', status: 'failed', lines: [2], failure: { line: 2, message: 'boom', stack: 's' } },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([{ from: 9, to: 17, message: 'boom' }])
})

test('stale sourceHash → no diagnostics', () => {
  const source = 'x 6 y'
  const r: SpecResults = {
    version: 1,
    specPath: 's.md',
    sourceHash: 'fnv1a:00000000',
    examples: [
      {
        name: 'r',
        status: 'failed',
        lines: [1],
        failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] },
      },
    ],
  }
  expect(runResultDiagnostics(r, source)).toEqual([])
})

test('all-passed results → no diagnostics', () => {
  const source = 'whatever'
  const r = results(source, [{ name: 'ok', status: 'passed', lines: [1] }])
  expect(runResultDiagnostics(r, source)).toEqual([])
})
