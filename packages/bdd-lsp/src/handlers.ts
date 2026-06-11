import { fileURLToPath } from 'node:url'
import type { MatchRef } from '@oselvar/bdd-language'
import type { Store } from './store.js'

type Position = { readonly line: number; readonly character: number }

type HoverParams = { readonly uri: string; readonly position: Position }
type HoverResult = { readonly contents: string } | null

type DefinitionParams = HoverParams
type Range = { readonly start: Position; readonly end: Position }
type LocationLink = {
  readonly originSelectionRange: Range
  readonly targetUri: string
  readonly targetRange: Range
  readonly targetSelectionRange: Range
}
type DefinitionResult = ReadonlyArray<LocationLink>

type Diagnostic = {
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: { readonly start: Position; readonly end: Position }
}

type MatchRangeEntry = { readonly range: Range; readonly params: ReadonlyArray<Range> }

type Handlers = {
  hover(params: HoverParams): HoverResult
  definition(params: DefinitionParams): DefinitionResult
  diagnosticsFor(uri: string): ReadonlyArray<Diagnostic>
  matchRanges(uri: string): ReadonlyArray<MatchRangeEntry>
}

export function buildHandlers(store: Store): Handlers {
  return {
    hover({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return null
      const contents = `Matched by \`step('${m.stepDef.expression}')\` at ${relative(m.stepDef.file, store.workspaceRoot())}:${m.stepDef.expressionRange.start.line}`
      return { contents }
    },
    definition({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return []
      const targetRange = toLspRange(m.stepDef.expressionRange)
      return [
        {
          // originSelectionRange tells the editor which area to underline on
          // cmd-hover; without it, only the word under the cursor is shown.
          originSelectionRange: toLspRange(m.range),
          targetUri: `file://${m.stepDef.file}`,
          targetRange,
          targetSelectionRange: targetRange,
        },
      ]
    },
    diagnosticsFor(uri) {
      const path = uriToPath(uri)
      return store
        .index()
        .diagnostics.filter((d) => d.bddPath === path)
        .map((d) => ({
          code: d.code,
          severity: d.severity,
          message: d.message,
          range: d.range,
        }))
    },
    matchRanges(uri) {
      const path = uriToPath(uri)
      return store
        .index()
        .matches.filter((m) => m.bddPath === path)
        .map((m) => ({
          range: toLspRange(m.range),
          params: m.paramRanges.map(toLspRange),
        }))
    },
  }
}

function findMatchAt(store: Store, uri: string, position: Position): MatchRef | undefined {
  const path = uriToPath(uri)
  // LSP positions are 0-based; the workspace index stores 1-based line/col.
  const pos: Position = { line: position.line + 1, character: position.character + 1 }
  return store.index().matches.find((m) => {
    if (m.bddPath !== path) return false
    return contains(m.range, pos)
  })
}

function contains(range: { start: Position; end: Position }, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false
  if (position.line === range.start.line && position.character < range.start.character) return false
  if (position.line === range.end.line && position.character > range.end.character) return false
  return true
}

function uriToPath(uri: string): string {
  return uri.startsWith('file://') ? fileURLToPath(uri) : uri
}

function relative(file: string, root: string): string {
  return file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file
}

function toLspRange(range: { start: Position; end: Position }): Range {
  return {
    start: { line: range.start.line - 1, character: range.start.character - 1 },
    end: { line: range.end.line - 1, character: range.end.character - 1 },
  }
}
