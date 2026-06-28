export const VERSION = '0.0.0'

export type {
  Block,
  Blockquote,
  Example,
  Fence,
  Heading,
  InlineOffset,
  ListItem,
  Paragraph,
  Row,
  Table,
  ThematicBreak,
  VarDoc,
} from './ast.js'
export type { CellDiff, RowCheck } from './cell-diff.js'
export {
  CellMismatchError,
  compareRow,
  compareTable,
  isCellMismatchError,
  ReturnShapeError,
} from './cell-diff.js'
export type { VarConfig } from './config-types.js'
export type {
  AmbiguousInput,
  Candidate,
  Diagnostic,
  DiagnosticCode,
  Severity,
} from './diagnostics.js'
export { ambiguousMatch } from './diagnostics.js'
export type { DocStringDiff } from './doc-string-diff.js'
export {
  compareDocString,
  DocStringMismatchError,
  isDocStringMismatchError,
} from './doc-string-diff.js'
export type { ExecutePorts } from './execute.js'
export { executePlan } from './execute.js'
export type { ExpressionDiff, ExpressionSegment, ParamFate } from './expression-segments.js'
export { diffExpressions, expressionSegments, renderExpression } from './expression-segments.js'
export type { StrippedInline } from './inline.js'
export { stripInline } from './inline.js'
export type { AmbiguityCollision, Hit, ResolvedSteps } from './matcher.js'
export { findHits, resolveHits } from './matcher.js'
export { parse } from './parse.js'
export type { ExecutionPlan, PlannedExample, PlannedStep } from './plan.js'
export { plan } from './plan.js'
export { gherkinDocStrings, gherkinTables } from './plugins/gherkin/index.js'
export type { Reporter, TestSink } from './ports.js'
export type {
  ParameterTypeInput,
  Registry,
  StepHandler,
  StepInput,
  StepRegistration,
} from './registry.js'
export { addStep, createRegistry, defineParameterType } from './registry.js'
export type { RawLine, ScannerPlugin } from './scanner.js'
export { scan } from './scanner.js'
export type { Sentence } from './sentences.js'
export { splitSentences } from './sentences.js'
export type { Snippet } from './snippet.js'
export { generateSnippet } from './snippet.js'
export { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
export type { Span } from './span.js'
export { spanFromOffsets } from './span.js'
export { structure } from './structurer.js'
export { renderTemplate } from './template.js'
