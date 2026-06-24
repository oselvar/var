import { buildWorkspaceIndex } from '@oselvar/var-language'

export type SegmentKind = 'plain' | 'step' | 'param'
export type Segment = { readonly text: string; readonly kind: SegmentKind }
export type HighlightedLine = ReadonlyArray<Segment>

type StepFile = { readonly path: string; readonly source: string }

// Astro escapes a fixed set of characters when it renders a text expression
// into a slot. Reverse the set Astro emits plus `&apos;` defensively (Astro
// does not emit `&apos;` but some tooling does). `&amp;` must be decoded last
// so we never double-decode.
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Rank by precedence so a character covered by both a step and a param renders
// as a param (the more specific span).
const RANK: Record<SegmentKind, number> = { plain: 0, step: 1, param: 2 }

export function highlightSteps(input: {
  readonly varPath: string
  readonly source: string
  readonly steps: ReadonlyArray<StepFile>
}): ReadonlyArray<HighlightedLine> {
  const { varPath, source, steps } = input
  const lines = source.split('\n')

  if (steps.length === 0) {
    return lines.map((text) => [{ text, kind: 'plain' as const }])
  }

  const index = buildWorkspaceIndex({
    stepFiles: steps.map((s) => ({ path: s.path, source: s.source })),
    varFiles: [{ path: varPath, source }],
  })
  const matches = index.matches.filter((m) => m.varPath === varPath)

  // Per line, a kind for every character (default plain). var-language ranges
  // are 1-based with an exclusive end; convert to 0-based half-open here.
  const kinds: SegmentKind[][] = lines.map((l) => new Array<SegmentKind>(l.length).fill('plain'))

  const paint = (
    range: { start: { line: number; character: number }; end: { line: number; character: number } },
    kind: SegmentKind,
  ): void => {
    for (let line = range.start.line; line <= range.end.line; line++) {
      const row = kinds[line - 1]
      if (!row) continue
      const from = line === range.start.line ? range.start.character - 1 : 0
      const to = line === range.end.line ? range.end.character - 1 : row.length
      for (let c = Math.max(0, from); c < Math.min(row.length, to); c++) {
        if (RANK[kind] > RANK[row[c] as SegmentKind]) row[c] = kind
      }
    }
  }

  for (const m of matches) {
    paint(m.range, 'step')
    for (let i = 0; i < m.paramRanges.length; i++) {
      const p = m.paramRanges[i]!
      const val = m.paramValues[i] ?? ''
      // {string} Cucumber parameters capture the surrounding quotes in their
      // group span. Shrink the range inward by one character on each side so
      // only the inner content (without quotes) is highlighted as a param.
      const isQuoted =
        val.length >= 2 &&
        ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      const paramRange = isQuoted ? shrinkRange(p) : p
      paint(paramRange, 'param')
    }
  }

  return lines.map((text, li) => coalesce(text, kinds[li] as SegmentKind[]))
}

type Range = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

// Shrink a single-line range inward by one character on each side.
// Used to strip the surrounding quotes from a {string} parameter range.
//
// ENGINE ASSUMPTION: the var-language matching engine INCLUDES the surrounding
// quotes inside the paramRange it returns for `{string}` parameters — i.e. the
// range covers `"world"`, not just `world`. This is the opposite of what the
// original design spec assumed, but it is what the engine actually does.
// step-highlight.test.ts pins this behaviour: its assertions check that the
// param chip text equals `world` (the inner value), not `"world"`. If the
// engine ever changes to exclude quotes from paramRanges, remove the shrink
// call in `highlightSteps` AND update those test assertions accordingly.
function shrinkRange(range: Range): Range {
  // Only handle single-line ranges (multi-line quoted strings are not expected).
  if (range.start.line !== range.end.line) return range
  return {
    start: { line: range.start.line, character: range.start.character + 1 },
    end: { line: range.end.line, character: range.end.character - 1 },
  }
}

function coalesce(text: string, kinds: ReadonlyArray<SegmentKind>): HighlightedLine {
  if (text.length === 0) return [{ text: '', kind: 'plain' }]
  const out: Segment[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || kinds[i] !== kinds[start]) {
      out.push({ text: text.slice(start, i), kind: kinds[start] as SegmentKind })
      start = i
    }
  }
  return out
}
