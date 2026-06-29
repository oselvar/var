import { type Span, spanFromOffsets } from './span.js'

// Split a `| a | b |` table row into trimmed cells and the source span of
// each cell's trimmed text. Works for Markdown rows (no leading space) and
// indented Gherkin rows alike. `lineStart` is the row's start offset in source.
export function parseRowCells(
  text: string,
  lineStart: number,
  source: string,
): { cells: ReadonlyArray<string>; cellSpans: ReadonlyArray<Span> } {
  const first = text.indexOf('|')
  const last = text.lastIndexOf('|')
  if (first < 0 || last <= first) return { cells: [], cellSpans: [] }
  const inner = text.slice(first + 1, last)
  const innerStart = first + 1
  const cells: string[] = []
  const cellSpans: Span[] = []
  let cursor = 0
  for (const seg of inner.split('|')) {
    const trimmed = seg.trim()
    const leading = seg.length - seg.trimStart().length
    const absStart = lineStart + innerStart + cursor + leading
    cells.push(trimmed)
    cellSpans.push(spanFromOffsets(source, absStart, absStart + trimmed.length))
    cursor += seg.length + 1 // +1 for the `|` delimiter
  }
  return { cells, cellSpans }
}
