import type { InlineOffset } from './ast.js'

export type StrippedInline = {
  readonly text: string
  readonly map: ReadonlyArray<InlineOffset>
}

export function stripInline(rawText: string, sourceBase: number): StrippedInline {
  const out: string[] = []
  const map: InlineOffset[] = []
  let textOffset = 0
  let i = 0

  const pushOffset = (sourceOffset: number) => {
    const last = map[map.length - 1]
    if (!last || last.textOffset !== textOffset) {
      map.push({ textOffset, sourceOffset })
    }
  }

  while (i < rawText.length) {
    const ch = rawText.charCodeAt(i)
    if (ch === 0x60 /* ` */) {
      const close = rawText.indexOf('`', i + 1)
      if (close === -1) {
        pushOffset(sourceBase + i)
        out.push(rawText[i] ?? '')
        textOffset++
        i++
        continue
      }
      pushOffset(sourceBase + i)
      const span = rawText.slice(i, close + 1)
      out.push(span)
      textOffset += span.length
      i = close + 1
      continue
    }
    if (ch === 0x5b /* [ */) {
      const close = findMatching(rawText, i, '[', ']')
      const lparen = close >= 0 ? rawText.charCodeAt(close + 1) : -1
      if (close > i && lparen === 0x28 /* ( */) {
        const closeParen = rawText.indexOf(')', close + 2)
        if (closeParen > close) {
          const inner = rawText.slice(i + 1, close)
          pushOffset(sourceBase + i + 1)
          out.push(inner)
          textOffset += inner.length
          i = closeParen + 1
          continue
        }
      }
    }
    if (
      (ch === 0x2a /* * */ || ch === 0x5f) /* _ */ &&
      (rawText.charCodeAt(i + 1) === ch || rawText.charCodeAt(i - 1) !== ch)
    ) {
      const isDouble = rawText.charCodeAt(i + 1) === ch
      const markerLength = isDouble ? 2 : 1
      // CommonMark: `_` only opens emphasis at a word boundary, so `snake_case`
      // and `foo_bar_baz` stay intact. `*` is allowed mid-word.
      if (ch === 0x5f /* _ */ && isWord(rawText[i - 1]) && isWord(rawText[i + markerLength])) {
        // mid-word underscore — copy literally
      } else {
        const marker = isDouble ? String.fromCharCode(ch, ch) : String.fromCharCode(ch)
        const closeAt = rawText.indexOf(marker, i + markerLength)
        if (closeAt > i + markerLength) {
          const inner = rawText.slice(i + markerLength, closeAt)
          pushOffset(sourceBase + i + markerLength)
          out.push(inner)
          textOffset += inner.length
          i = closeAt + markerLength
          continue
        }
      }
    }
    pushOffset(sourceBase + i)
    out.push(rawText[i] ?? '')
    textOffset++
    i++
  }
  if (map.length === 0) map.push({ textOffset: 0, sourceOffset: sourceBase })
  return { text: out.join(''), map }
}

function isWord(ch: string | undefined): boolean {
  if (!ch) return false
  return /[\p{L}\p{N}_]/u.test(ch)
}

function findMatching(text: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let j = start; j < text.length; j++) {
    if (text[j] === open) depth++
    else if (text[j] === close) {
      depth--
      if (depth === 0) return j
    }
  }
  return -1
}
