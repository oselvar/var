import type { Block, InlineOffset } from './ast.js'
import { stripInline } from './inline.js'
import { type Span, spanFromOffsets } from './span.js'
import { parseRowCells } from './table-cells.js'

// A scanner-line representation that plugins receive verbatim. Plugins use
// the offsets to materialize span info on the blocks they produce.
export type RawLine = {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

// A plugin extension that participates in block recognition. Plugins are
// tried at each non-blank line BEFORE the built-in rules; this lets a
// Gherkin-table plugin grab `| a | b |` rows without a `|---|` separator
// before the built-in paragraph fallback consumes them.
export type ScannerPlugin = {
  readonly name: string
  tryScan(input: {
    readonly source: string
    readonly lines: ReadonlyArray<RawLine>
    readonly startIdx: number
  }): { readonly block: Block; readonly next: number } | undefined
}

export function scan(
  source: string,
  plugins: ReadonlyArray<ScannerPlugin> = [],
): ReadonlyArray<Block> {
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
    const matched = runPlugins(source, lines, i, plugins)
    if (matched) {
      blocks.push(matched.block)
      i = matched.next
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
    const { paragraph, next } = consumeParagraph(source, lines, i, plugins)
    blocks.push(paragraph)
    i = next
  }
  return blocks
}

function runPlugins(
  source: string,
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
  plugins: ReadonlyArray<ScannerPlugin>,
): { block: Block; next: number } | undefined {
  for (const p of plugins) {
    const r = p.tryScan({ source, lines, startIdx })
    if (r) return r
  }
  return undefined
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
    const rawText = ul[3] ?? ''
    const markerStart = line.startOffset + (ul[1] ?? '').length
    const markerEnd = markerStart + (ul[2] ?? '').length
    const textStart = line.startOffset + line.text.indexOf(rawText)
    const { text, map: inlineMap } = stripInline(rawText, textStart)
    return {
      kind: 'list_item',
      ordered: false,
      text,
      span: spanFromOffsets(source, line.startOffset, line.endOffset),
      inlineMap,
      markerSpan: spanFromOffsets(source, markerStart, markerEnd),
    }
  }
  const ol = OL_RE.exec(line.text)
  if (ol) {
    const rawText = ol[4] ?? ''
    const markerStart = line.startOffset + (ol[1] ?? '').length
    const markerEnd = markerStart + (ol[2] ?? '').length + (ol[3] ?? '').length
    const textStart = line.startOffset + line.text.indexOf(rawText)
    const { text, map: inlineMap } = stripInline(rawText, textStart)
    return {
      kind: 'list_item',
      ordered: true,
      text,
      span: spanFromOffsets(source, line.startOffset, line.endOffset),
      inlineMap,
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

  const firstSegmentRaw = m[1] ?? ''
  const firstSegmentSourceBase = first.startOffset + first.text.indexOf(firstSegmentRaw)
  const firstStripped = stripInline(firstSegmentRaw, firstSegmentSourceBase)

  const strippedSegments: string[] = [firstStripped.text]
  const inlineMap: InlineOffset[] = [...firstStripped.map]
  let joinedTextOffset = firstStripped.text.length

  let i = startIdx + 1
  let endOffset = first.endOffset
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) break
    const next = BQ_RE.exec(ln.text)
    if (!next) break
    const segmentRaw = next[1] ?? ''
    const segmentSourceBase = ln.startOffset + ln.text.indexOf(segmentRaw)
    const stripped = stripInline(segmentRaw, segmentSourceBase)

    joinedTextOffset += 1 // newline separator
    for (const entry of stripped.map) {
      inlineMap.push({
        textOffset: joinedTextOffset + entry.textOffset,
        sourceOffset: entry.sourceOffset,
      })
    }
    strippedSegments.push(stripped.text)
    joinedTextOffset += stripped.text.length
    endOffset = ln.endOffset
    i++
  }
  return {
    quote: {
      kind: 'blockquote',
      text: strippedSegments.join('\n'),
      span: spanFromOffsets(source, first.startOffset, endOffset),
      inlineMap,
    },
    next: i,
  }
}

function consumeParagraph(
  source: string,
  lines: ReadonlyArray<RawLine>,
  startIdx: number,
  plugins: ReadonlyArray<ScannerPlugin>,
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
    // Plugins also get a vote: if any plugin would recognise a block starting
    // at this line, end the paragraph here so the plugin can run next round.
    if (runPlugins(source, lines, candidateIdx, plugins)) break
    endIdx++
  }
  const last = lines[endIdx]
  if (!last) throw new Error('invariant: endIdx out of range')
  const startOffset = first.startOffset
  const endOffset = last.endOffset
  const rawText = source.slice(startOffset, endOffset)
  const { text, map: inlineMap } = stripInline(rawText, startOffset)
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
