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
export type { VarConfig, VarGlobs } from './config-types.js'
export type {
  BundleArtifacts,
  FailureArtifact,
  PlanArtifact,
  RegistryArtifact,
  StepTrace,
  TraceArtifact,
  VarDocArtifact,
} from './conformance.js'
export {
  canonicalStringify,
  runConformance,
  toFailureArtifact,
  toPlanArtifact,
  toRegistryArtifact,
  toVarDocArtifact,
} from './conformance.js'
export { deepEqual } from './deep-equal.js'
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
export type { ExecutePorts, ExecutionObserver, QueuedExample, StepObservation } from './execute.js'
export {
  collectExamples,
  executePlan,
  isUnexpectedPassError,
  UnexpectedPassError,
} from './execute.js'
export type { ExpressionDiff, ExpressionSegment, ParamFate } from './expression-segments.js'
export { diffExpressions, expressionSegments, renderExpression } from './expression-segments.js'
export { toFailure } from './failure.js'
export { hashSource } from './hash.js'
export type { StrippedInline } from './inline.js'
export { stripInline } from './inline.js'
export type { AmbiguityCollision, Hit, ResolvedSteps } from './matcher.js'
export { findHits, resolveHits } from './matcher.js'
export { compareParams } from './param-diff.js'
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
export type { CellFailure, ExampleResult, SpecResults } from './result.js'
export type { RunDiagnostic } from './run-diagnostics.js'
export { runResultDiagnostics } from './run-diagnostics.js'
export type { RawLine, ScannerPlugin } from './scanner.js'
export { scan } from './scanner.js'
export type { Sentence } from './sentences.js'
export { splitSentences } from './sentences.js'
export type { Span } from './span.js'
export { spanFromOffsets } from './span.js'
export type { StepKind } from './step-role.js'
export { inferStepRole } from './step-role.js'
export { structure } from './structurer.js'
