import type { Row, Table } from '../../ast.js'
import type { RawLine, ScannerPlugin } from '../../scanner.js'
import { spanFromOffsets } from '../../span.js'

// Gherkin tables are a contiguous run of `| ... |` rows, with no separator
// row between the header and the body (Markdown requires `|---|`; Gherkin
// does not). The first row becomes the header so callers that pass the table
// to a handler get a `string[][]` with the header at index 0.
//
// Indented Gherkin tables are common (`      | a | b |`), so we trim leading
// whitespace before testing the pipe shape.
const ROW_RE = /^\s*\|(.+)\|\s*$/

export function gherkinTables(): ScannerPlugin {
  return {
    name: 'gherkin/tables',
    tryScan({ source, lines, startIdx }) {
      const first = lines[startIdx]
      if (!first || !ROW_RE.test(first.text)) return undefined
      // Don't compete with the built-in Markdown table when a `|---|`
      // separator immediately follows — let the standard scanner handle it.
      const second = lines[startIdx + 1]
      if (second && /^\s*\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|\s*$/.test(second.text)) {
        return undefined
      }
      const headerRow = makeRow(source, first)
      const rows: Row[] = []
      let i = startIdx + 1
      while (i < lines.length) {
        const ln = lines[i]
        if (!ln || !ROW_RE.test(ln.text)) break
        rows.push(makeRow(source, ln))
        i++
      }
      const lastSpan = rows[rows.length - 1]?.span ?? headerRow.span
      const table: Table = {
        kind: 'table',
        header: headerRow,
        rows,
        span: spanFromOffsets(source, first.startOffset, lastSpan.endOffset),
      }
      return { block: table, next: i }
    },
  }
}

function makeRow(source: string, line: RawLine): Row {
  return {
    cells: parseCells(line.text),
    span: spanFromOffsets(source, line.startOffset, line.endOffset),
  }
}

function parseCells(text: string): ReadonlyArray<string> {
  const m = ROW_RE.exec(text)
  if (!m) return []
  return (m[1] ?? '').split('|').map((c) => c.trim())
}
