import type { Span } from './span.js'

export type Heading = {
  readonly kind: 'heading'
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly text: string
  readonly span: Span
}

export type Paragraph = {
  readonly kind: 'paragraph'
  readonly text: string
  readonly span: Span
  readonly inlineMap: ReadonlyArray<InlineOffset>
}

export type InlineOffset = {
  readonly textOffset: number
  readonly sourceOffset: number
}

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

export type Block = Heading | Paragraph | ListItem | Blockquote | Table | Fence | ThematicBreak

export type Example = {
  // The chain of heading texts above this block, outer→inner. An example
  // directly at file scope (no enclosing heading) has an empty stack. The
  // runtime turns this into nested `describe` calls.
  readonly scopeStack: ReadonlyArray<string>
  readonly span: Span
  // Always non-empty. First entry is the candidate primary block
  // (paragraph / list_item / blockquote). Any trailing tables or fences are
  // appended by the structurer so the planner can attach them to the last
  // matched step.
  readonly body: ReadonlyArray<Block>
}

export type Bdd = {
  readonly path: string
  readonly source: string
  readonly examples: ReadonlyArray<Example>
  readonly orphanAttachments: ReadonlyArray<Table | Fence>
}
