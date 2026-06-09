export const VERSION = '0.0.0'

export { spanFromOffsets } from './span.js'
export type { Span } from './span.js'

export { scan } from './scanner.js'

export type { Bdd, Block, Heading, Paragraph, Example, InlineOffset } from './ast.js'

export { structure } from './structurer.js'

export { parse } from './parse.js'

export { splitSentences } from './sentences.js'
export type { Sentence } from './sentences.js'

export { createRegistry, addStep } from './registry.js'
export type { Registry, StepRegistration, StepInput, StepHandler } from './registry.js'
