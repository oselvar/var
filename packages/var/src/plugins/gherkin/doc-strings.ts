import type { Fence } from '../../ast.js'
import type { ScannerPlugin } from '../../scanner.js'
import { spanFromOffsets } from '../../span.js'

// Gherkin doc strings open and close with either `"""` or `'''` on their own
// line (allowing leading whitespace). An optional language identifier can
// follow the opening marker (e.g. `"""json`).
//
// We map the result onto a `Fence` AST node so the planner's existing
// attachment logic (table/fence following a step-bearing block) just works.
const OPEN_RE = /^(\s*)("""|''')(\s*\S*)?\s*$/

export function gherkinDocStrings(): ScannerPlugin {
  return {
    name: 'gherkin/doc-strings',
    tryScan({ source, lines, startIdx }) {
      const start = lines[startIdx]
      if (!start) return undefined
      const open = OPEN_RE.exec(start.text)
      if (!open) return undefined
      const indent = open[1] ?? ''
      const marker = open[2] ?? ''
      const info = (open[3] ?? '').trim()
      // Find the matching closing marker — same marker, same indent.
      let i = startIdx + 1
      let bodyEnd: number | undefined
      let closeEnd: number | undefined
      while (i < lines.length) {
        const ln = lines[i]
        if (!ln) {
          i++
          continue
        }
        if (ln.text.trimEnd() === `${indent}${marker}`) {
          closeEnd = ln.endOffset
          break
        }
        bodyEnd = ln.endOffset + 1 // include the trailing newline
        i++
      }
      if (closeEnd === undefined) return undefined
      const firstBodyLine = lines[startIdx + 1]
      const bodyStart = firstBodyLine?.startOffset ?? start.endOffset
      // Strip the common indent (the indent of the opening marker) from each
      // body line so the handler doesn't get gherkin's leading whitespace.
      const rawBody = source.slice(bodyStart, bodyEnd ?? bodyStart)
      const body =
        indent.length > 0
          ? rawBody
              .split('\n')
              .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
              .join('\n')
          : rawBody
      const fence: Fence = {
        kind: 'fence',
        info,
        body,
        bodySpan: spanFromOffsets(source, bodyStart, bodyEnd ?? bodyStart),
        span: spanFromOffsets(source, start.startOffset, closeEnd),
      }
      return { block: fence, next: i + 1 }
    },
  }
}
