import type { Node } from 'web-tree-sitter'
import type { HandlerParams, Position, Range } from '../step-defs.ts'

export type LanguageId =
  | 'typescript'
  | 'typescript-tsx'
  | 'python'
  | 'java'
  | 'kotlin'
  | 'ruby'
  | 'rust'
  | 'csharp'

// One entry per language: the queries plus the three language-specific
// behaviors (string decoding, handler-param extraction, regexp resolution).
// Everything else — parsing, capture handling, range math — is shared and
// language-agnostic (the extraction seam from ADR 0001).
export type LanguageSpec = {
  readonly stepDefQuery: string
  readonly parameterTypeQuery: string
  decodeString(node: Node): string
  extractHandlerParams(handlerNode: Node): HandlerParams | undefined
  resolveRegexp(node: Node): string
}

export function toPosition(point: { row: number; column: number }): Position {
  return { line: point.row + 1, character: point.column + 1 }
}

export function toRange(startNode: Node, endNode: Node = startNode): Range {
  return { start: toPosition(startNode.startPosition), end: toPosition(endNode.endPosition) }
}
