import type { Block, InlineOffset } from './ast.js'
import { spanFromOffsets } from './span.js'

export function scan(source: string): ReadonlyArray<Block> {
  const blocks: Block[] = []
  const lines = splitLines(source)
  for (const line of lines) {
    if (line.text.trim().length === 0) continue
    const heading = tryHeading(source, line)
    if (heading) {
      blocks.push(heading)
    } else {
      blocks.push(makeParagraph(source, line))
    }
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
  return {
    kind: 'heading',
    level,
    text,
    span: spanFromOffsets(source, line.startOffset, line.endOffset),
  }
}

function makeParagraph(source: string, line: RawLine): Block {
  const inlineMap: ReadonlyArray<InlineOffset> = [{ textOffset: 0, sourceOffset: line.startOffset }]
  return {
    kind: 'paragraph',
    text: line.text,
    span: spanFromOffsets(source, line.startOffset, line.endOffset),
    inlineMap,
  }
}
