import { hashSource } from './hash.ts'
import type { SpecResults } from './result.ts'

// One renderable failure: a source-offset range plus a human message. Offsets
// are absolute source positions (== CodeMirror positions); `to` is exclusive.
// Renderer-agnostic — the LSP converts to line/character, the web editor uses
// the offsets directly.
export type RunDiagnostic = {
  readonly from: number
  readonly to: number
  readonly message: string
}

// [from, to) of 1-based `line` in `source`, where `to` excludes the trailing newline.
function lineRange(source: string, line: number): { from: number; to: number } {
  let from = 0
  let current = 1
  for (let i = 0; i < source.length && current < line; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      current++
      from = i + 1
    }
  }
  const nl = source.indexOf('\n', from)
  return { from, to: nl === -1 ? source.length : nl }
}

// Project a SpecResults onto offset-based diagnostics against the CURRENT
// source. If the source changed since the run (hash mismatch) the offsets no
// longer apply, so emit nothing.
export function runResultDiagnostics(
  results: SpecResults,
  source: string,
): ReadonlyArray<RunDiagnostic> {
  if (hashSource(source) !== results.sourceHash) return []
  const out: RunDiagnostic[] = []
  for (const ex of results.examples) {
    if (ex.status !== 'failed' || !ex.failure) continue
    const f = ex.failure
    if (f.cells && f.cells.length > 0) {
      for (const c of f.cells) {
        out.push({
          from: c.from,
          to: c.to,
          message: `expected ${source.slice(c.from, c.to)} but was ${c.actual}`,
        })
      }
    } else {
      const { from, to } = lineRange(source, f.line)
      out.push({ from, to, message: f.message })
    }
  }
  return out
}
