export type Span = {
  readonly startOffset: number
  readonly endOffset: number
  readonly startLine: number
  readonly startCol: number
  readonly endLine: number
  readonly endCol: number
}

export function spanFromOffsets(source: string, startOffset: number, endOffset: number): Span {
  const { line: startLine, col: startCol } = lineCol(source, startOffset)
  const { line: endLine, col: endCol } = lineCol(source, endOffset)
  return { startOffset, endOffset, startLine, startCol, endLine, endCol }
}

function lineCol(source: string, offset: number): { line: number; col: number } {
  let line = 1
  let col = 1
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 0x0a /* \n */) {
      line++
      col = 1
    } else {
      col++
    }
  }
  return { line, col }
}
