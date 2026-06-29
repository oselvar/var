import { runResultDiagnostics, type SpecResults, spanFromOffsets } from '@oselvar/var-core'

export type LspPosition = { readonly line: number; readonly character: number }
export type LspDiagnostic = {
  readonly severity: number
  readonly source: string
  readonly message: string
  readonly range: { readonly start: LspPosition; readonly end: LspPosition }
  readonly code?: string // preserved from parse diagnostics; run diagnostics omit it
}

// Pure: SpecResults + current source → LSP diagnostics (0-based positions).
// Reuses the core projection; converts each offset range via spanFromOffsets
// (1-based span → 0-based LSP), matching the existing parse-diagnostic mapping.
export function runLspDiagnostics(results: SpecResults, source: string): LspDiagnostic[] {
  return runResultDiagnostics(results, source).map((d) => {
    const span = spanFromOffsets(source, d.from, d.to)
    return {
      severity: 1, // Error
      source: 'var',
      message: d.message,
      range: {
        start: { line: span.startLine - 1, character: span.startCol - 1 },
        end: { line: span.endLine - 1, character: span.endCol - 1 },
      },
    }
  })
}

function isSpecResults(v: unknown): v is SpecResults {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    o.version === 1 &&
    typeof o.specPath === 'string' &&
    typeof o.sourceHash === 'string' &&
    Array.isArray(o.examples)
  )
}

export type RunResultsStore = {
  // Parse a .var/<spec>.json and key it by its spec's file:// URI. Returns that
  // URI, or null if the content is unparseable / the wrong version.
  ingest(varJsonPath: string, content: string): string | null
  // Forget a .var json (on delete). Returns the spec URI it had mapped, or null.
  remove(varJsonPath: string): string | null
  get(specUri: string): SpecResults | undefined
  specUris(): ReadonlyArray<string>
}

export function createRunResultsStore(rootUri: string): RunResultsStore {
  const root = rootUri.replace(/\/$/, '')
  const byUri = new Map<string, SpecResults>()
  const uriByPath = new Map<string, string>() // varJsonPath → specUri, so deletes resolve
  return {
    ingest(varJsonPath, content) {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        return null
      }
      if (!isSpecResults(parsed)) return null
      const specUri = `${root}/${parsed.specPath}`
      byUri.set(specUri, parsed)
      uriByPath.set(varJsonPath, specUri)
      return specUri
    },
    remove(varJsonPath) {
      const specUri = uriByPath.get(varJsonPath)
      if (specUri === undefined) return null
      byUri.delete(specUri)
      uriByPath.delete(varJsonPath)
      return specUri
    },
    get: (specUri) => byUri.get(specUri),
    specUris: () => [...byUri.keys()],
  }
}
