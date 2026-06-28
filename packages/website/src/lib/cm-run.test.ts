import { hashSource, type SpecResults } from '@oselvar/var'
import { describe, expect, it } from 'vitest'
import { varDiagnostics } from './cm-run.js'

const SOURCE = 'x 6 y'
const results: SpecResults = {
  version: 1,
  specPath: 's.var.md',
  sourceHash: hashSource(SOURCE),
  examples: [
    { name: 'r', status: 'failed', lines: [1], failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] } },
  ],
}

describe('varDiagnostics', () => {
  it('maps a cell mismatch to a CodeMirror error diagnostic', () => {
    expect(varDiagnostics(results, SOURCE)).toEqual([
      { from: 2, to: 3, severity: 'error', message: 'expected 6 but was 50' },
    ])
  })

  it('returns nothing when results are null', () => {
    expect(varDiagnostics(null, SOURCE)).toEqual([])
  })

  it('returns nothing when the doc no longer hash-matches (stale)', () => {
    expect(varDiagnostics(results, `${SOURCE} edited`)).toEqual([])
  })
})
