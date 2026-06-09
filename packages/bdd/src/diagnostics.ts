import type { Snippet } from './snippet.js'
import type { Span } from './span.js'

export type Severity = 'error' | 'warning'

export type Diagnostic = {
  readonly severity: Severity
  readonly code: DiagnosticCode
  readonly message: string
  readonly span: Span
}

export type DiagnosticCode = 'ambiguous-match' | 'missing-step' | 'orphan-attachment'

export type Candidate = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
}

export type AmbiguousInput = {
  readonly text: string
  readonly span: Span
  readonly candidates: ReadonlyArray<Candidate>
}

export function ambiguousMatch(input: AmbiguousInput): Diagnostic {
  const lines = input.candidates
    .map((c) => `  step('${c.expression}', ...)    at ${c.sourceFile}:${c.sourceLine}`)
    .join('\n')
  return {
    severity: 'error',
    code: 'ambiguous-match',
    message: `Ambiguous step: "${input.text}"\nMatched by:\n${lines}`,
    span: input.span,
  }
}

export type MissingStepInput = {
  readonly text: string
  readonly span: Span
  readonly snippet: Snippet
}

export function missingStep(input: MissingStepInput): Diagnostic {
  const message =
    `Step missing: "${input.text}"\n` +
    `Suggested step definition:\n  ${input.snippet.fullCode.replace(/\n/g, '\n  ')}\n` +
    `Generate it with: bdd stepdef "${input.text}"`
  return {
    severity: 'error',
    code: 'missing-step',
    message,
    span: input.span,
  }
}

export type OrphanInput = {
  readonly text: string
  readonly span: Span
  readonly kind: 'table' | 'fence'
}

export function orphanAttachment(input: OrphanInput): Diagnostic {
  const what = input.kind === 'table' ? 'table' : 'fenced code block'
  return {
    severity: 'warning',
    code: 'orphan-attachment',
    message: `Orphan ${what}: does not immediately follow a step-bearing block, so it is not attached as a DataTable/DocString.`,
    span: input.span,
  }
}
