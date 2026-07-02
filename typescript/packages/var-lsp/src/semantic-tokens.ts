import type { MatchRef } from '@oselvar/var-language'

export const SEMANTIC_LEGEND = {
  tokenTypes: ['function', 'parameter'] as const,
  tokenModifiers: [] as const,
}
const FUNCTION = 0
const PARAMETER = 1

type Range = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

export function semanticTokenData(
  matches: ReadonlyArray<MatchRef>,
  varPath: string,
  source: string,
): number[] {
  const lines = source.split('\n')
  // per-char kind per line: 0 none, 1 function (step), 2 parameter (wins)
  const kinds: number[][] = lines.map((l) => new Array<number>(l.length).fill(0))

  const paint = (range: Range, kind: number): void => {
    for (let line = range.start.line; line <= range.end.line; line++) {
      const row = kinds[line - 1]
      if (!row) continue
      const from = line === range.start.line ? range.start.character - 1 : 0
      const to = line === range.end.line ? range.end.character - 1 : row.length
      for (let c = Math.max(0, from); c < Math.min(row.length, to); c++) {
        if (kind >= (row[c] as number)) row[c] = kind
      }
    }
  }

  for (const m of matches) {
    if (m.varPath !== varPath) continue
    paint(m.range, 1)
    for (const p of m.paramRanges) paint(p, 2)
    for (const h of m.headerCellRanges ?? []) paint(h, 2)
  }

  const data: number[] = []
  let prevLine = 0
  let prevChar = 0
  for (let li = 0; li < lines.length; li++) {
    const row = kinds[li] as number[]
    let c = 0
    while (c < row.length) {
      const k = row[c] as number
      if (k === 0) {
        c++
        continue
      }
      let end = c + 1
      while (end < row.length && row[end] === k) end++
      const deltaLine = li - prevLine
      const deltaChar = deltaLine === 0 ? c - prevChar : c
      data.push(deltaLine, deltaChar, end - c, k === 1 ? FUNCTION : PARAMETER, 0)
      prevLine = li
      prevChar = c
      c = end
    }
  }
  return data
}
