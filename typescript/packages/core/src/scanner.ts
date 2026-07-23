import type { Block, SegmentOffset } from './ast.ts'
import { type Span, spanFromOffsets } from './span.ts'
import { parseRowCells } from './table-cells.ts'

// A scanned source line with the offsets needed to materialize spans on the
// blocks built from it.
type RawLine = {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

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
    const thematic = tryThematic(source, line)
    if (thematic) {
      blocks.push(thematic)
      i++
      continue
    }
    const bqResult = tryBlockquote(source, lines, i)
    if (bqResult) {
      blocks.push(bqResult.quote)
      i = bqResult.next
      continue
    }
    const heading = tryHeading(source, line)
    if (heading) {
      blocks.push(heading)
      i++
      continue
    }
    const listItem = tryListItem(source, line)
    if (listItem) {
      blocks.push(listItem)
      i++
      continue
    }
    const { paragraph, next } = consumeParagraph(source, lines, i)
    blocks.push(paragraph)
    i = next
  }
  return blocks
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

const THEMATIC_RE = /^\s*([-*_])(\s*\1){2,}\s*$/
const UL_RE = /^(\s*)([-*+])\s+(.*)$/
const OL_RE = /^(\s*)(\d+)([.)])\s+(.*)$/
const BQ_RE = /^>\s?(.*)$/

function tryThematic(source: string, line: RawLine): Block | undefined {
  if (!THEMATIC_RE.test(line.text)) return undefined
  return {
    kind: 'thematic_break',
    span: spanFromOffsets(source, line.startOffset, line.endOffset),
  }
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

function tryListItem(source: string, line: RawLine): Block | undefined {
  const ul = UL_RE.exec(line.text)
  if (ul) {
    const text = ul[3] ?? ''
    const markerStart = line.startOffset + (ul[1] ?? '').length
    const markerEnd = markerStart + (ul[2] ?? '').length
    const textStart = line.startOffset + line.text.indexOf(text)
    return {
      kind: 'list_item',
      ordered: false,
      text,
      span: spanFromOffsets(source, line.startOffset, line.endOffset),
      segmentMap: [{ textOffset: 0, sourceOffset: textStart }],
      markerSpan: spanFromOffsets(source, markerStart, markerEnd),
    }
  }
  const ol = OL_RE.exec(line.text)
  if (ol) {
    const text = ol[4] ?? ''
    const markerStart = line.startOffset + (ol[1] ?? '').length
    const markerEnd = markerStart + (ol[2] ?? '').length + (ol[3] ?? '').length
    const textStart = line.startOffset + line.text.indexOf(text)
    return {
      kind: 'list_item',
      ordered: true,
      text,
      span: spanFromOffsets(source, line.startOffset, line.endOffset),
      segmentMap: [{ textOffset: 0, sourceOffset: textStart }],
      markerSpan: spanFromOffsets(source, markerStart, markerEnd),
    }
  }
  return undefined
}

function tryBlockquote(
  source: string,
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
): { quote: Block; next: number } | undefined {
  const first = lines[startIdx]
  if (!first) return undefined
  const m = BQ_RE.exec(first.text)
  if (!m) return undefined

  // Each quoted line drops its `> ` prefix — block structure, not text — so
  // the joined text needs one segment entry per line to map back to source.
  const firstSegment = m[1] ?? ''
  const segments: string[] = [firstSegment]
  const segmentMap: SegmentOffset[] = [
    { textOffset: 0, sourceOffset: first.startOffset + first.text.indexOf(firstSegment) },
  ]
  let joinedTextOffset = firstSegment.length

  let i = startIdx + 1
  let endOffset = first.endOffset
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) break
    const next = BQ_RE.exec(ln.text)
    if (!next) break
    const segment = next[1] ?? ''
    joinedTextOffset += 1 // newline separator
    segmentMap.push({
      textOffset: joinedTextOffset,
      sourceOffset: ln.startOffset + ln.text.indexOf(segment),
    })
    segments.push(segment)
    joinedTextOffset += segment.length
    endOffset = ln.endOffset
    i++
  }
  return {
    quote: {
      kind: 'blockquote',
      text: segments.join('\n'),
      span: spanFromOffsets(source, first.startOffset, endOffset),
      segmentMap,
    },
    next: i,
  }
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
    const candidateIdx = endIdx + 1
    const candidate = lines[candidateIdx]
    if (!candidate) break
    if (candidate.text.trim().length === 0) break
    if (/^#{1,6}\s+/.test(candidate.text)) break
    if (UL_RE.test(candidate.text)) break
    if (OL_RE.test(candidate.text)) break
    if (BQ_RE.test(candidate.text)) break
    if (FENCE_RE.test(candidate.text)) break
    if (ROW_RE.test(candidate.text)) break
    if (THEMATIC_RE.test(candidate.text)) break
    endIdx++
  }
  const last = lines[endIdx]
  if (!last) throw new Error('invariant: endIdx out of range')
  const startOffset = first.startOffset
  const endOffset = last.endOffset
  return {
    paragraph: {
      kind: 'paragraph',
      text: source.slice(startOffset, endOffset),
      span: spanFromOffsets(source, startOffset, endOffset),
      segmentMap: [{ textOffset: 0, sourceOffset: startOffset }],
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
const DELIM_RE = /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|\s*$/

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
  const headerParsed = parseRowCells(headerLine.text, headerLine.startOffset, source)
  const header = {
    cells: headerParsed.cells,
    cellSpans: headerParsed.cellSpans,
    span: spanFromOffsets(source, headerLine.startOffset, headerLine.endOffset),
  }
  const rows: {
    cells: ReadonlyArray<string>
    cellSpans: ReadonlyArray<Span>
    span: Span
  }[] = []
  let i = startIdx + 2
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) break
    if (!ROW_RE.test(ln.text)) break
    const parsed = parseRowCells(ln.text, ln.startOffset, source)
    rows.push({
      cells: parsed.cells,
      cellSpans: parsed.cellSpans,
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
