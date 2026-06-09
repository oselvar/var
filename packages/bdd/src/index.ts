export const VERSION = '0.0.0'

// Re-export core type from cucumber-expressions to acknowledge the dependency
export type { Expression } from '@cucumber/cucumber-expressions'

export { spanFromOffsets } from './span.js'
export type { Span } from './span.js'

export { scan } from './scanner.js'

export type { Bdd, Block, Heading, Paragraph, Example, InlineOffset } from './ast.js'

export { splitSentences } from './sentences.js'
export type { Sentence } from './sentences.js'
