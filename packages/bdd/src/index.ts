export const VERSION = '0.0.0'

export { spanFromOffsets } from './span.js'
export type { Span } from './span.js'

export { scan } from './scanner.js'

export type {
  Bdd,
  Block,
  Heading,
  Paragraph,
  ListItem,
  Blockquote,
  Row,
  Table,
  Fence,
  ThematicBreak,
  Example,
  InlineOffset,
} from './ast.js'

export { structure } from './structurer.js'

export { parse } from './parse.js'

export { splitSentences } from './sentences.js'
export type { Sentence } from './sentences.js'

export { createRegistry, addStep, defineParameterType } from './registry.js'
export type {
  Registry,
  StepRegistration,
  StepInput,
  StepHandler,
  ParameterTypeInput,
} from './registry.js'
export { expressionSegments, diffExpressions, renderExpression } from './expression-segments.js'
export type { ExpressionSegment, ExpressionDiff, ParamFate } from './expression-segments.js'

export { ambiguousMatch, missingStep, orphanAttachment } from './diagnostics.js'
export type {
  AmbiguousInput,
  Candidate,
  Diagnostic,
  DiagnosticCode,
  MissingStepInput,
  OrphanInput,
  Severity,
} from './diagnostics.js'

export { findHits, resolveHits } from './matcher.js'
export type { Hit, ResolvedSteps, AmbiguityCollision } from './matcher.js'

export { plan } from './plan.js'
export type { ExecutionPlan, PlannedExample, PlannedStep } from './plan.js'

export { stripInline } from './inline.js'
export type { StrippedInline } from './inline.js'

export type { ScannerPlugin, RawLine } from './scanner.js'
export { gherkinTables, gherkinDocStrings } from './plugins/gherkin/index.js'

export { generateSnippet } from './snippet.js'
export type { Snippet } from './snippet.js'

export { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'

export type { TestSink, Reporter } from './ports.js'

export { executePlan } from './execute.js'
export type { ExecutePorts } from './execute.js'

export { renderTemplate } from './template.js'

export { loadBddConfig } from './config.js'
export type { BddConfig } from './config.js'
