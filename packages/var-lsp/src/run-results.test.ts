import { hashSource, type SpecResults } from '@oselvar/var-core'
import { describe, expect, it } from 'vitest'
import { createRunResultsStore, runLspDiagnostics } from './run-results.js'

const SOURCE = 'x 6 y'
const SPEC: SpecResults = {
  version: 1,
  specPath: 'docs/a.md',
  sourceHash: hashSource(SOURCE),
  examples: [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] },
    },
  ],
}

describe('runLspDiagnostics', () => {
  it('maps run diagnostics to 0-based LSP diagnostics tagged source: var, severity error', () => {
    expect(runLspDiagnostics(SPEC, SOURCE)).toEqual([
      {
        severity: 1,
        source: 'var',
        message: 'expected 6 but was 50',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } },
      },
    ])
  })

  it('returns nothing when the source no longer hash-matches (stale)', () => {
    expect(runLspDiagnostics(SPEC, `${SOURCE} edited`)).toEqual([])
  })
})

describe('RunResultsStore', () => {
  it('ingests a valid .var json and keys it by the spec file URI', () => {
    const store = createRunResultsStore('file:///root')
    const uri = store.ingest('/root/.var/docs/a.md.json', JSON.stringify(SPEC))
    expect(uri).toBe('file:///root/docs/a.md')
    expect(store.get('file:///root/docs/a.md')).toEqual(SPEC)
    expect(store.specUris()).toEqual(['file:///root/docs/a.md'])
  })

  it('rejects malformed JSON and a wrong version (stores nothing)', () => {
    const store = createRunResultsStore('file:///root')
    expect(store.ingest('/root/.var/x.json', 'not json')).toBeNull()
    expect(
      store.ingest(
        '/root/.var/x.json',
        JSON.stringify({ version: 2, specPath: 'x', sourceHash: 'h', examples: [] }),
      ),
    ).toBeNull()
    expect(store.specUris()).toEqual([])
  })

  it('remove() drops the entry and returns its spec URI', () => {
    const store = createRunResultsStore('file:///root')
    store.ingest('/root/.var/docs/a.md.json', JSON.stringify(SPEC))
    expect(store.remove('/root/.var/docs/a.md.json')).toBe('file:///root/docs/a.md')
    expect(store.get('file:///root/docs/a.md')).toBeUndefined()
  })
})
