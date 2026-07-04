# Core 1b — Tables, Fences, Lists & Attachment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the core to recognize fenced code blocks, GFM tables, lists, blockquotes, and thematic breaks; strip inline markdown (bold/italic/links) when building paragraph text; attach tables as `DataTable` and fences as `DocString` arguments to their preceding step.

**Architecture:** Extension of Plan 1's scanner + structurer + planner. No new packages. Same FCIS rules: every new function pure, every new type `readonly`. Plan 1's `Block` union grows; downstream consumers narrow on `kind` and ignore unknown variants gracefully.

**Tech Stack:** Same as Plan 1 (TypeScript, pnpm, biome, vitest, knip, jscpd).

**Depends on:** Plan 1 (Core MVP) completed.

---

## Task 1: Extend the AST

**Files:**
- Modify: `packages/bdd/src/ast.ts`
- Create: `packages/bdd/tests/ast-extended.test.ts`

- [ ] **Step 1: Write failing type-level tests**

`packages/bdd/tests/ast-extended.test.ts`:
```ts
import { expectTypeOf, test } from 'vitest'
import type {
  Block,
  Blockquote,
  Fence,
  Heading,
  ListItem,
  Paragraph,
  Row,
  Table,
  ThematicBreak,
} from '../src/ast.js'

test('Block includes all v1 block kinds', () => {
  expectTypeOf<Block>().toEqualTypeOf<
    Heading | Paragraph | ListItem | Blockquote | Table | Fence | ThematicBreak
  >()
})

test('Table rows are readonly arrays of readonly cells', () => {
  expectTypeOf<Table['rows']>().toEqualTypeOf<ReadonlyArray<Row>>()
  expectTypeOf<Row['cells']>().toEqualTypeOf<ReadonlyArray<string>>()
})

test('Fence carries info string and body', () => {
  expectTypeOf<Fence>().toMatchTypeOf<{
    readonly kind: 'fence'
    readonly info: string
    readonly body: string
  }>()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: missing exports for `ListItem`, `Blockquote`, `Table`, `Fence`, `ThematicBreak`, `Row`.

- [ ] **Step 3: Extend `packages/bdd/src/ast.ts`**

Add to `packages/bdd/src/ast.ts`:
```ts
export type ListItem = {
  readonly kind: 'list_item'
  readonly text: string
  readonly span: Span
  readonly inlineMap: ReadonlyArray<InlineOffset>
  readonly ordered: boolean
  readonly markerSpan: Span
}

export type Blockquote = {
  readonly kind: 'blockquote'
  readonly text: string
  readonly span: Span
  readonly inlineMap: ReadonlyArray<InlineOffset>
}

export type Row = { readonly cells: ReadonlyArray<string>; readonly span: Span }

export type Table = {
  readonly kind: 'table'
  readonly span: Span
  readonly header: Row
  readonly rows: ReadonlyArray<Row>
}

export type Fence = {
  readonly kind: 'fence'
  readonly span: Span
  readonly info: string
  readonly body: string
  readonly bodySpan: Span
}

export type ThematicBreak = {
  readonly kind: 'thematic_break'
  readonly span: Span
}
```

Update the `Block` union to:
```ts
export type Block = Heading | Paragraph | ListItem | Blockquote | Table | Fence | ThematicBreak
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: ast-extended tests pass; all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/ast.ts packages/bdd/tests/ast-extended.test.ts
git commit -m "feat(bdd): extend AST with table, fence, list, blockquote, thematic-break"
```

---

## Task 2: Scanner — fenced code blocks

**Files:**
- Modify: `packages/bdd/src/scanner.ts`
- Modify: `packages/bdd/tests/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/bdd/tests/scanner.test.ts`:
```ts
test('scan recognizes a fenced code block with info string', () => {
  const source = '# Title\n\n```json\n{ "a": 1 }\n```\n'
  const blocks = scan(source)
  const fence = blocks.find((b) => b.kind === 'fence')
  if (fence?.kind !== 'fence') throw new Error('expected fence')
  expect(fence.info).toBe('json')
  expect(fence.body).toBe('{ "a": 1 }\n')
})

test('scan tolerates a fence with no info string', () => {
  const blocks = scan('```\nplain body\n```')
  const fence = blocks.find((b) => b.kind === 'fence')
  if (fence?.kind !== 'fence') throw new Error('expected fence')
  expect(fence.info).toBe('')
  expect(fence.body).toBe('plain body\n')
})

test('scan does not split paragraphs across a fence', () => {
  const source = 'paragraph above\n\n```\nbody\n```\n\nparagraph below'
  const blocks = scan(source)
  expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'fence', 'paragraph'])
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: scanner produces paragraphs in place of fences (or invalid token order).

- [ ] **Step 3: Extend the scanner with fence recognition**

In `packages/bdd/src/scanner.ts`, update the main loop to call `tryFence` before paragraph consumption. Add:
```ts
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
  const body = bodyStart !== undefined && bodyEnd !== undefined ? source.slice(bodyStart, bodyEnd) : ''
  const bodySpan = spanFromOffsets(
    source,
    bodyStart ?? start.endOffset,
    bodyEnd ?? start.endOffset,
  )
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
```

Then in `scan`'s top-level loop, before the heading/paragraph branches:
```ts
const fence = tryFence(source, lines, i)
if (fence) {
  blocks.push(fence.fence)
  i = fence.next
  continue
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: fence tests pass; existing paragraph and heading tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/scanner.ts packages/bdd/tests/scanner.test.ts
git commit -m "feat(bdd): scanner recognizes fenced code blocks"
```

---

## Task 3: Scanner — GFM tables

**Files:**
- Modify: `packages/bdd/src/scanner.ts`
- Modify: `packages/bdd/tests/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/bdd/tests/scanner.test.ts`:
```ts
test('scan recognizes a GFM table with header + delimiter + rows', () => {
  const source = '| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |\n'
  const blocks = scan(source)
  const table = blocks.find((b) => b.kind === 'table')
  if (table?.kind !== 'table') throw new Error('expected table')
  expect(table.header.cells).toEqual(['name', 'age'])
  expect(table.rows).toHaveLength(2)
  expect(table.rows[0]?.cells).toEqual(['Bob', '30'])
  expect(table.rows[1]?.cells).toEqual(['Eve', '25'])
})

test('a line that looks like a row but has no following delimiter is a paragraph', () => {
  const blocks = scan('| not | a | table |')
  expect(blocks[0]?.kind).toBe('paragraph')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: tables are still being captured as paragraphs.

- [ ] **Step 3: Extend the scanner with table recognition**

Add to `packages/bdd/src/scanner.ts`:
```ts
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
  return (m[1] ?? '')
    .split('|')
    .map((c) => c.trim())
}
```

Wire `tryTable` into the main loop alongside `tryFence`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: table tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/scanner.ts packages/bdd/tests/scanner.test.ts
git commit -m "feat(bdd): scanner recognizes GFM tables"
```

---

## Task 4: Scanner — thematic breaks

**Files:**
- Modify: `packages/bdd/src/scanner.ts`
- Modify: `packages/bdd/tests/scanner.test.ts`

- [ ] **Step 1: Write failing test**

Append to `packages/bdd/tests/scanner.test.ts`:
```ts
test.each(['---', '***', '___', '----', '* * *'])('recognizes thematic break: %s', (mark) => {
  const blocks = scan(`a\n\n${mark}\n\nb`)
  expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'thematic_break', 'paragraph'])
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: thematic breaks are treated as paragraphs.

- [ ] **Step 3: Extend the scanner with thematic-break recognition**

Add to `packages/bdd/src/scanner.ts`:
```ts
const THEMATIC_RE = /^\s*([-*_])(\s*\1){2,}\s*$/

function tryThematic(source: string, line: RawLine): Block | undefined {
  if (!THEMATIC_RE.test(line.text)) return undefined
  return {
    kind: 'thematic_break',
    span: spanFromOffsets(source, line.startOffset, line.endOffset),
  }
}
```

Call `tryThematic` in the main loop alongside `tryHeading`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: thematic break tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/scanner.ts packages/bdd/tests/scanner.test.ts
git commit -m "feat(bdd): scanner recognizes thematic breaks"
```

---

## Task 5: Scanner — lists and blockquotes

**Files:**
- Modify: `packages/bdd/src/scanner.ts`
- Modify: `packages/bdd/tests/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/bdd/tests/scanner.test.ts`:
```ts
test('scan recognizes unordered list items', () => {
  const blocks = scan('- Given I have 100\n- When I withdraw 40\n- Then I should have 60')
  expect(blocks.map((b) => b.kind)).toEqual(['list_item', 'list_item', 'list_item'])
  const first = blocks[0]
  if (first?.kind !== 'list_item') throw new Error('expected list_item')
  expect(first.ordered).toBe(false)
  expect(first.text).toBe('Given I have 100')
})

test('scan recognizes ordered list items', () => {
  const blocks = scan('1. First step\n2. Second step')
  expect(blocks.map((b) => b.kind)).toEqual(['list_item', 'list_item'])
  const first = blocks[0]
  if (first?.kind !== 'list_item') throw new Error('expected list_item')
  expect(first.ordered).toBe(true)
})

test('scan recognizes blockquotes', () => {
  const blocks = scan('> Given I have 100\n> When I withdraw 40')
  expect(blocks).toHaveLength(1)
  const bq = blocks[0]
  if (bq?.kind !== 'blockquote') throw new Error('expected blockquote')
  expect(bq.text).toBe('Given I have 100\nWhen I withdraw 40')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: lists/blockquotes are still paragraphs.

- [ ] **Step 3: Extend the scanner with list-item and blockquote recognition**

Add to `packages/bdd/src/scanner.ts`:
```ts
const UL_RE = /^(\s*)([-*+])\s+(.*)$/
const OL_RE = /^(\s*)(\d+)([.)])\s+(.*)$/
const BQ_RE = /^>\s?(.*)$/

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
      inlineMap: [{ textOffset: 0, sourceOffset: textStart }],
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
      inlineMap: [{ textOffset: 0, sourceOffset: textStart }],
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
  const segments: string[] = [m[1] ?? '']
  const inlineMap = [
    { textOffset: 0, sourceOffset: first.startOffset + first.text.indexOf(m[1] ?? '') },
  ]
  let textOffset = (m[1] ?? '').length
  let i = startIdx + 1
  let endOffset = first.endOffset
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln) break
    const next = BQ_RE.exec(ln.text)
    if (!next) break
    textOffset += 1 // newline separator inside joined text
    inlineMap.push({ textOffset, sourceOffset: ln.startOffset + ln.text.indexOf(next[1] ?? '') })
    segments.push(next[1] ?? '')
    textOffset += (next[1] ?? '').length
    endOffset = ln.endOffset
    i++
  }
  return {
    quote: {
      kind: 'blockquote',
      text: segments.join('\n'),
      span: spanFromOffsets(source, first.startOffset, endOffset),
      inlineMap,
    },
    next: i,
  }
}
```

In the main loop, call `tryListItem` per line (it's single-line) and call `tryBlockquote` like `tryFence`/`tryTable` because it spans multiple lines.

Make sure `tryListItem` is called BEFORE the paragraph-grouping branch, and `tryBlockquote` BEFORE `tryListItem`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: list and blockquote tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/scanner.ts packages/bdd/tests/scanner.test.ts
git commit -m "feat(bdd): scanner recognizes lists and blockquotes"
```

---

## Task 6: Inline markdown stripping

**Files:**
- Create: `packages/bdd/src/inline.ts`
- Create: `packages/bdd/tests/inline.test.ts`
- Modify: `packages/bdd/src/scanner.ts` (paragraph/list-item/blockquote constructors call into `stripInline`)

- [ ] **Step 1: Write failing tests**

`packages/bdd/tests/inline.test.ts`:
```ts
import { expect, test } from 'vitest'
import { stripInline } from '../src/inline.js'

test('strips bold and italic markers, preserving inner text', () => {
  const { text, map } = stripInline('Given I have **100** in *my* account', 10)
  expect(text).toBe('Given I have 100 in my account')
  expect(map.find((m) => m.textOffset === 13)?.sourceOffset).toBe(10 + 'Given I have **'.length)
})

test('reduces inline links to their text, drops the URL', () => {
  const { text } = stripInline('See [the docs](https://example.com).', 0)
  expect(text).toBe('See the docs.')
})

test('preserves backtick code spans verbatim (including the backticks)', () => {
  const { text } = stripInline('Run `npm test` first.', 0)
  expect(text).toBe('Run `npm test` first.')
})

test('map allows lifting text offsets back to source offsets', () => {
  const { text, map } = stripInline('a **bold** word', 100)
  expect(text).toBe('a bold word')
  // 'bold' starts at text offset 2; in source it is at 100 + 'a **'.length = 104
  const offset = liftOffset(map, 2)
  expect(offset).toBe(104)
})

function liftOffset(map: ReadonlyArray<{ textOffset: number; sourceOffset: number }>, t: number): number {
  let best = map[0]
  for (const e of map) {
    if (e.textOffset <= t) best = e
  }
  if (!best) throw new Error('empty map')
  return best.sourceOffset + (t - best.textOffset)
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: cannot resolve `../src/inline.js`.

- [ ] **Step 3: Implement `packages/bdd/src/inline.ts`**

```ts
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
      (ch === 0x2a /* * */ || ch === 0x5f /* _ */) &&
      (rawText.charCodeAt(i + 1) === ch || rawText.charCodeAt(i - 1) !== ch)
    ) {
      const isDouble = rawText.charCodeAt(i + 1) === ch
      const markerLength = isDouble ? 2 : 1
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
    pushOffset(sourceBase + i)
    out.push(rawText[i] ?? '')
    textOffset++
    i++
  }
  if (map.length === 0) map.push({ textOffset: 0, sourceOffset: sourceBase })
  return { text: out.join(''), map }
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
```

- [ ] **Step 4: Wire inline stripping into the paragraph/list-item/blockquote constructors**

Update `packages/bdd/src/scanner.ts` so that:
- The paragraph constructor (from Plan 1 Task 5) calls `stripInline(rawText, baseOffset)` to produce `text` and `inlineMap`.
- `tryListItem` calls `stripInline` on the captured `text` and replaces the single-entry `inlineMap` with the returned map.
- `tryBlockquote` calls `stripInline` on each captured line segment and threads the offsets through into the joined map.

For each of these constructors, the `text` field becomes the stripped text and `inlineMap` is the map returned by `stripInline`.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: inline tests pass; scanner tests still pass; sentence/structurer/plan tests still pass (inline-stripped text only changes paragraph content, not block structure).

- [ ] **Step 6: Commit**

```bash
git add packages/bdd/src/inline.ts packages/bdd/src/scanner.ts packages/bdd/tests/inline.test.ts
git commit -m "feat(bdd): strip bold/italic/link markdown, keep code spans verbatim"
```

---

## Task 7: Structurer — track orphan tables and fences

**Files:**
- Modify: `packages/bdd/src/ast.ts` (add `orphanAttachments` field)
- Modify: `packages/bdd/src/structurer.ts`
- Modify: `packages/bdd/tests/structurer.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/bdd/tests/structurer.test.ts`:
```ts
test('orphan tables and fences are recorded on the Bdd', () => {
  const source = '| name | age |\n|------|-----|\n| Bob  | 30  |'
  const bdd = structure('o.bdd.md', source, scan(source))
  expect(bdd.orphanAttachments).toHaveLength(1)
  expect(bdd.orphanAttachments[0]?.kind).toBe('table')
})

test('table immediately after a paragraph (preceded by a heading) is NOT orphan', () => {
  const source = '## Example\n\nGiven these users:\n\n| name |\n|------|\n| Bob  |'
  const bdd = structure('o.bdd.md', source, scan(source))
  expect(bdd.orphanAttachments).toHaveLength(0)
  // table should be part of the example body
  expect(bdd.examples[0]?.body.some((b) => b.kind === 'table')).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: `orphanAttachments` does not exist on `Bdd`.

- [ ] **Step 3: Update `Bdd` type and structurer**

In `packages/bdd/src/ast.ts`, add to `Bdd`:
```ts
readonly orphanAttachments: ReadonlyArray<Table | Fence>
```

In `packages/bdd/src/structurer.ts`, change `structure` to track tables/fences that appear before any heading or after the last example body's last step-bearing block. Specifically:
- While walking `blocks` outside any example body, if you encounter a `table` or `fence`, push it to `orphanAttachments`.
- Inside an example body, allow tables and fences to be part of `body` (they're attached later by the planner).

```ts
export function structure(path: string, source: string, blocks: ReadonlyArray<Block>): Bdd {
  const examples: Example[] = []
  const orphanAttachments: (Table | Fence)[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (!block) {
      i++
      continue
    }
    if (block.kind === 'table' || block.kind === 'fence') {
      orphanAttachments.push(block)
      i++
      continue
    }
    if (block.kind !== 'heading') {
      i++
      continue
    }
    const heading = block
    const body: Block[] = []
    let j = i + 1
    while (j < blocks.length) {
      const next = blocks[j]
      if (!next) {
        j++
        continue
      }
      if (next.kind === 'heading') break
      body.push(next)
      j++
    }
    if (body.length > 0) {
      examples.push(makeExample(source, heading, body))
    }
    i = j
  }
  return { path, source, examples, orphanAttachments }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: structurer orphan tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/ast.ts packages/bdd/src/structurer.ts packages/bdd/tests/structurer.test.ts
git commit -m "feat(bdd): track orphan tables and fences on Bdd"
```

---

## Task 8: Planner — block walking covers lists and blockquotes

**Files:**
- Modify: `packages/bdd/src/plan.ts`
- Modify: `packages/bdd/tests/plan.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/bdd/tests/plan.test.ts`:
```ts
test('plan walks list items as step-bearing blocks', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 's.ts', expressionSourceLine: 2, handler: () => {},
  })
  const source = '# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40'
  const result = plan(parse('b.bdd.md', source), r)
  expect(result.examples[0]?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
  ])
})

test('plan walks blockquote content as step-bearing', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  const source = '# Quote\n\n> Given I have 100 in my account'
  const result = plan(parse('q.bdd.md', source), r)
  expect(result.examples[0]?.steps).toHaveLength(1)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: planner only walks `paragraph` blocks today.

- [ ] **Step 3: Update `planBlock` callers in `packages/bdd/src/plan.ts`**

In the loop in `plan` that walks `ex.body`, change:
```ts
if (block.kind !== 'paragraph') continue
```
to:
```ts
if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote') continue
```

Also, the `liftSpan` helper currently narrows on `paragraph`; extend it to handle `list_item` and `blockquote`:
```ts
function liftSpan(source: string, block: Block, blockStart: number, blockEnd: number): Span {
  if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote') {
    return block.span
  }
  return liftFromInlineMap(source, block.inlineMap, blockStart, blockEnd)
}

function liftFromInlineMap(
  source: string,
  inlineMap: ReadonlyArray<InlineOffset>,
  blockStart: number,
  blockEnd: number,
): Span {
  const start = liftInlineOffset(inlineMap, blockStart)
  const end = liftInlineOffset(inlineMap, blockEnd)
  return spanFromOffsets(source, start, end)
}

function liftInlineOffset(
  inlineMap: ReadonlyArray<InlineOffset>,
  textOffset: number,
): number {
  let best = inlineMap[0]
  for (const entry of inlineMap) {
    if (entry.textOffset <= textOffset) best = entry
  }
  if (!best) throw new Error('empty inlineMap')
  return best.sourceOffset + (textOffset - best.textOffset)
}
```

Add `import type { InlineOffset } from './ast.js'` at the top of `plan.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: list/blockquote planner tests pass; paragraph tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/plan.ts packages/bdd/tests/plan.test.ts
git commit -m "feat(bdd): planner walks list items and blockquotes"
```

---

## Task 9: DataTable attachment

**Files:**
- Modify: `packages/bdd/src/plan.ts`
- Modify: `packages/bdd/tests/plan.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/bdd/tests/plan.test.ts`:
```ts
test('a markdown table immediately following a step-bearing block attaches as DataTable', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  const source = `# Users
Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |`
  const result = plan(parse('u.bdd.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable?.header.cells).toEqual(['name', 'age'])
  expect(step?.dataTable?.rows).toHaveLength(2)
})

test('a table not immediately after a step-bearing block does NOT attach', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  // Paragraph between step and table
  const source = `# Mid
Given these users exist:

Some interrupting prose.

| name | age |
|------|-----|
| Bob  | 30  |`
  const result = plan(parse('m.bdd.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.dataTable).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: `PlannedStep.dataTable` doesn't exist.

- [ ] **Step 3: Add `dataTable` to `PlannedStep` and implement attachment**

In `packages/bdd/src/plan.ts`, update the `PlannedStep` type:
```ts
export type PlannedStep = {
  readonly text: string
  readonly matchSpan: Span
  readonly stepDef: StepRegistration
  readonly args: ReadonlyArray<unknown>
  readonly dataTable?: Table
  readonly docString?: { content: string; contentType: string }
}
```

(Import `Table` and `Fence` from `./ast.js`.)

In `plan()`, after walking the body and emitting steps, sweep the body a second time and:
- For each `table` block whose immediate predecessor (skipping `thematic_break`) is a paragraph/list-item/blockquote that yielded at least one step, attach the table to the last emitted step of that predecessor.
- Same for `fence` blocks (attach as `docString`).
- Update `PlannedExample.steps` immutably: rebuild the array with new `PlannedStep` entries.

A clear way to do this without mutating: tag each `PlannedStep` with its source block index when emitting, then in a second pass rebuild the array applying attachments.

Concrete implementation:
```ts
const stepsByBlock = new Map<number, PlannedStep[]>()
ex.body.forEach((block, idx) => {
  if (block.kind === 'paragraph' || block.kind === 'list_item' || block.kind === 'blockquote') {
    // emit steps (existing logic) into stepsByBlock.get(idx) ?? new array
  }
})

const attachments = new Map<number, { dataTable?: Table; docString?: { content: string; contentType: string } }>()
for (let idx = 1; idx < ex.body.length; idx++) {
  const here = ex.body[idx]
  const prev = ex.body[idx - 1]
  if (!here || !prev) continue
  if (here.kind === 'table' && stepsByBlock.has(idx - 1)) {
    attachments.set(idx - 1, { ...(attachments.get(idx - 1) ?? {}), dataTable: here })
  } else if (here.kind === 'fence' && stepsByBlock.has(idx - 1)) {
    attachments.set(idx - 1, {
      ...(attachments.get(idx - 1) ?? {}),
      docString: { content: here.body, contentType: here.info },
    })
  }
}

const finalSteps: PlannedStep[] = []
ex.body.forEach((_b, idx) => {
  const stepsAtIdx = stepsByBlock.get(idx) ?? []
  const attachAt = attachments.get(idx)
  for (let s = 0; s < stepsAtIdx.length; s++) {
    const step = stepsAtIdx[s]
    if (!step) continue
    if (s === stepsAtIdx.length - 1 && attachAt) {
      finalSteps.push({ ...step, ...attachAt })
    } else {
      finalSteps.push(step)
    }
  }
})
```

(Slot this into the body of `plan` replacing the current `for (const block of ex.body)` loop.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: dataTable tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/plan.ts packages/bdd/tests/plan.test.ts
git commit -m "feat(bdd): attach following table as DataTable on last step"
```

---

## Task 10: DocString attachment

**Files:**
- Modify: `packages/bdd/tests/plan.test.ts`

- [ ] **Step 1: Write failing test**

Append to `packages/bdd/tests/plan.test.ts`:
```ts
test('a fenced code block immediately following a step-bearing block attaches as DocString', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  const source = `# Payload
When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``
  const result = plan(parse('p.bdd.md', source), r)
  const step = result.examples[0]?.steps[0]
  expect(step?.docString?.contentType).toBe('json')
  expect(step?.docString?.content).toBe('{ "action": "import" }\n')
})

test('a step with NO following fence has no docString', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  const result = plan(parse('p.bdd.md', '# P\nWhen I send the payload'), r)
  expect(result.examples[0]?.steps[0]?.docString).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify pass (Task 9's implementation already covers DocString)**

Run: `pnpm --filter @oselvar/bdd test`
Expected: DocString tests pass without further code changes — Task 9's attachment loop already handled `fence` blocks.

If the test fails, return to Task 9's attachment loop and ensure the `here.kind === 'fence'` branch is implemented and the `docString` field is wired through.

- [ ] **Step 3: Commit**

```bash
git add packages/bdd/tests/plan.test.ts
git commit -m "test(bdd): cover DocString attachment for fenced code blocks"
```

---

## Task 11: End-to-end smoke test + quality gates

**Files:**
- Create: `packages/bdd/tests/e2e.test.ts`

- [ ] **Step 1: Write a comprehensive end-to-end test**

`packages/bdd/tests/e2e.test.ts`:
```ts
import { expect, test } from 'vitest'
import { addStep, createRegistry, parse, plan } from '../src/index.js'

test('end-to-end: a complete BDD file with headings, prose, list, table, and fence', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
    expressionSourceFile: 's.ts', expressionSourceLine: 1, handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 's.ts', expressionSourceLine: 2, handler: () => {},
  })
  r = addStep(r, {
    expression: 'I should have {int} left',
    expressionSourceFile: 's.ts', expressionSourceLine: 3, handler: () => {},
  })
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts', expressionSourceLine: 4, handler: () => {},
  })
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts', expressionSourceLine: 5, handler: () => {},
  })

  const source = `# Withdrawing cash

Given I have 100 in my account, when I withdraw 40, then I should have 60 left.

# Importing users

Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |

When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``

  const result = plan(parse('e.bdd.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
  expect(result.examples).toHaveLength(2)

  const withdraw = result.examples[0]
  expect(withdraw?.name).toBe('Withdrawing cash')
  expect(withdraw?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])

  const importing = result.examples[1]
  expect(importing?.name).toBe('Importing users')
  expect(importing?.steps).toHaveLength(2)
  expect(importing?.steps[0]?.dataTable?.rows).toHaveLength(2)
  expect(importing?.steps[1]?.docString?.contentType).toBe('json')
})
```

- [ ] **Step 2: Run to verify pass**

Run: `pnpm --filter @oselvar/bdd test`
Expected: e2e test passes.

- [ ] **Step 3: Run all quality gates**

Run: `pnpm check`
Expected: lint, tests, knip, jscpd all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/bdd/tests/e2e.test.ts
git commit -m "test(bdd): end-to-end coverage for headings, lists, tables, and fences"
```

---

## Plan summary

After Plan 1b, the core can ingest any `.bdd.md` file with the markdown features the spec calls for in v1, except keyword-led missing-step diagnostics and the snippet generator (those come in Plan 1c). Specifically gained in this plan:

- Scanner supports fenced code blocks, GFM tables, thematic breaks, ordered/unordered lists, and blockquotes.
- Inline markdown (bold/italic/links) is stripped from paragraph/list-item/blockquote text, with an `inlineMap` that lets the planner lift text-relative offsets back to source byte positions.
- Structurer tracks orphan tables/fences for diagnostics downstream.
- Planner walks list items and blockquotes in addition to paragraphs.
- Tables and fences attach as `DataTable` / `DocString` arguments to the last step of the preceding step-bearing block, "immediately following" defined as no intervening non-thematic block.
- End-to-end test exercises a realistic combined `.bdd.md` document.

Carried forward to Plan 1c: keyword-as-hint diagnostics, snippet generator, orphan-attachment diagnostics from the lint pass.
