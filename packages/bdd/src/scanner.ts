import type { Block, InlineOffset } from './ast.js'
import { spanFromOffsets } from './span.js'

export function scan(source: string): ReadonlyArray<Block> {
  const blocks: Block[] = []
  const lines = splitLines(source)

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line) {
      i++
      continue
    }
    if (line.text.trim().length === 0) {
      i++
      continue
    }
    const fence = tryFence(source, lines, i)
    if (fence) {
      blocks.push(fence.fence)
      i = fence.next
      continue
    }
    const tableResult = tryTable(source, lines, i)
    if (tableResult) {
      blocks.push(tableResult.table)
      i = tableResult.next
      continue
    }
    const heading = tryHeading(source, line)
    if (heading) {
      blocks.push(heading)
      i++
      continue
    }
    const { paragraph, next } = consumeParagraph(source, lines, i)
    blocks.push(paragraph)
    i = next
  }
  return blocks
}

type RawLine = {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

function splitLines(source: string): ReadonlyArray<RawLine> {
  const out: RawLine[] = []
  let start = 0
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      out.push({ text: source.slice(start, i), startOffset: start, endOffset: i })
      start = i + 1
    }
  }
  if (start <= source.length) {
    out.push({ text: source.slice(start), startOffset: start, endOffset: source.length })
  }
  return out
}

function tryHeading(source: string, line: RawLine): Block | undefined {
  const m = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line.text)
  if (!m) return undefined
  const hashes = m[1] ?? ''
  const text = (m[2] ?? '').trim()
  const level = hashes.length as 1 | 2 | 3 | 4 | 5 | 6
  const span = spanFromOffsets(source, line.startOffset, line.endOffset)
  return { kind: 'heading', level, text, span }
}

function consumeParagraph(
  source: string,
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
): { paragraph: Block; next: number } {
  const first = lines[startIdx]
  if (!first) throw new Error('invariant: startIdx out of range')
  let endIdx = startIdx
  while (endIdx + 1 < lines.length) {
    const candidate = lines[endIdx + 1]
    if (!candidate) break
    if (candidate.text.trim().length === 0) break
    if (/^#{1,6}\s+/.test(candidate.text)) break
    endIdx++
  }
  const last = lines[endIdx]
  if (!last) throw new Error('invariant: endIdx out of range')
  const startOffset = first.startOffset
  const endOffset = last.endOffset
  const text = source.slice(startOffset, endOffset)
  const inlineMap = buildInlineMap(lines, startIdx, endIdx, startOffset)
  return {
    paragraph: {
      kind: 'paragraph',
      text,
      span: spanFromOffsets(source, startOffset, endOffset),
      inlineMap,
    },
    next: endIdx + 1,
  }
}

const FENCE_RE = /^(`{3,})\s*(\S*)\s*$/

function tryFence(
  source: string,
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
): { fence: Block; next: number } | undefined {
  const start = lines[startIdx]
  if (!start) return undefined
  const open = FENCE_RE.exec(start.text)
  if (!open) return undefined
  const fenceMarker = open[1] ?? ''
  const info = (open[2] ?? '').trim()
  let i = startIdx + 1
  let bodyStart: number | undefined
  let bodyEnd: number | undefined
  let endOffset = start.endOffset
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) {
      i++
      continue
    }
    const close = FENCE_RE.exec(ln.text)
    if (close && (close[1] ?? '').length >= fenceMarker.length) {
      endOffset = ln.endOffset
      break
    }
    if (bodyStart === undefined) bodyStart = ln.startOffset
    bodyEnd = ln.endOffset + 1 /* include the newline that separates from next line */
    i++
  }
  const body =
    bodyStart !== undefined && bodyEnd !== undefined ? source.slice(bodyStart, bodyEnd) : ''
  const bodySpan = spanFromOffsets(source, bodyStart ?? start.endOffset, bodyEnd ?? start.endOffset)
  return {
    fence: {
      kind: 'fence',
      info,
      body,
      bodySpan,
      span: spanFromOffsets(source, start.startOffset, endOffset),
    },
    next: i + 1,
  }
}

const ROW_RE = /^\|(.+)\|\s*$/
const DELIM_RE = /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|\s*$/

function tryTable(
  source: string,
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
): { table: Block; next: number } | undefined {
  const headerLine = lines[startIdx]
  const delimLine = lines[startIdx + 1]
  if (!headerLine || !delimLine) return undefined
  if (!ROW_RE.test(headerLine.text)) return undefined
  if (!DELIM_RE.test(delimLine.text)) return undefined
  const header = {
    cells: parseCells(headerLine.text),
    span: spanFromOffsets(source, headerLine.startOffset, headerLine.endOffset),
  }
  const rows: { cells: ReadonlyArray<string>; span: ReturnType<typeof spanFromOffsets> }[] = []
  let i = startIdx + 2
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) break
    if (!ROW_RE.test(ln.text)) break
    rows.push({
      cells: parseCells(ln.text),
      span: spanFromOffsets(source, ln.startOffset, ln.endOffset),
    })
    i++
  }
  const lastRow = rows[rows.length - 1]
  const endOffset = lastRow ? lastRow.span.endOffset : delimLine.endOffset
  return {
    table: {
      kind: 'table',
      span: spanFromOffsets(source, headerLine.startOffset, endOffset),
      header,
      rows,
    },
    next: i,
  }
}

function parseCells(line: string): ReadonlyArray<string> {
  const m = ROW_RE.exec(line)
  if (!m) return []
  return (m[1] ?? '').split('|').map((c) => c.trim())
}

function buildInlineMap(
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
  endIdx: number,
  baseSourceOffset: number,
): ReadonlyArray<InlineOffset> {
  const out: InlineOffset[] = []
  let textOffset = 0
  for (let i = startIdx; i <= endIdx; i++) {
    const ln = lines[i]
    if (!ln) continue
    out.push({ textOffset, sourceOffset: ln.startOffset })
    textOffset += ln.text.length
    if (i < endIdx) {
      // Account for the newline between joined lines.
      textOffset += 1
    }
    void baseSourceOffset
  }
  return out
}
