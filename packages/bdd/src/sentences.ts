export type Sentence = {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'cf.', 'vs.'])

export function splitSentences(text: string): ReadonlyArray<Sentence> {
  const out: Sentence[] = []
  let i = 0
  let segmentStart = 0
  const skip = new Array(text.length).fill(false)

  // Mark backtick code spans and double-quoted strings as no-split zones.
  // This keeps terminators like `!` and `?` inside `"Hello, world!"` from
  // breaking up a sentence the matcher needs as a whole `{string}` token.
  for (let j = 0; j < text.length; j++) {
    const c = text.charCodeAt(j)
    if (c === 0x60 /* ` */) {
      const close = text.indexOf('`', j + 1)
      if (close === -1) break
      for (let k = j; k <= close; k++) skip[k] = true
      j = close
    } else if (c === 0x22 /* " */) {
      const close = text.indexOf('"', j + 1)
      if (close === -1) break
      for (let k = j; k <= close; k++) skip[k] = true
      j = close
    }
  }

  while (i < text.length) {
    if (skip[i]) {
      i++
      continue
    }
    const ch = text.charCodeAt(i)
    if (
      ch === 0x0a /* \n */ ||
      ch === 0x2e /* . */ ||
      ch === 0x21 /* ! */ ||
      ch === 0x3f /* ? */
    ) {
      if (ch === 0x2e && isInsideNumberOrAbbrev(text, i)) {
        i++
        continue
      }
      const end = i + 1
      pushSegment(out, text, segmentStart, end)
      i = end
      // Skip any following whitespace (spaces + newlines) so the next sentence
      // starts at its first content character.
      while (i < text.length && (text.charCodeAt(i) === 0x20 || text.charCodeAt(i) === 0x0a)) i++
      segmentStart = i
      continue
    }
    i++
  }
  pushSegment(out, text, segmentStart, text.length)
  return out
}

function pushSegment(out: Sentence[], text: string, start: number, end: number): void {
  if (end <= start) return
  const slice = text.slice(start, end).trim()
  if (slice.length === 0) return
  const trimmedStart =
    start + (text.slice(start, end).length - text.slice(start, end).trimStart().length)
  const trimmedEnd = trimmedStart + slice.length
  out.push({ text: slice, startOffset: trimmedStart, endOffset: trimmedEnd })
}

function isInsideNumberOrAbbrev(text: string, dotPos: number): boolean {
  const prev = text.charCodeAt(dotPos - 1)
  const next = text.charCodeAt(dotPos + 1)
  if (prev >= 0x30 && prev <= 0x39 && next >= 0x30 && next <= 0x39) return true
  // Check known abbreviations ending at dotPos+1
  for (const abbrev of ABBREVIATIONS) {
    if (text.slice(Math.max(0, dotPos + 1 - abbrev.length), dotPos + 1) === abbrev) return true
  }
  // Lowercase letter following → likely intra-word
  if (next >= 0x61 && next <= 0x7a) return true
  return false
}
