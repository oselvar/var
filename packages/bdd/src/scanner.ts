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
