import type { StepKind } from '@varar/core'

// Shared, language-neutral shapes produced by every StepDefScanner (all
// tree-sitter-backed — see tree-sitter-scanner.ts). This module is types only:
// extraction lives in the async shell edge, never here.

export type Position = { readonly line: number; readonly character: number }
export type Range = { readonly start: Position; readonly end: Position }

export type HandlerParam = {
  // The source text after the colon, e.g. `string` for `name: string` or
  // empty when no annotation is present (e.g. `ctx`). Opaque: produced
  // verbatim from the tree-sitter node text and never parsed downstream —
  // every consumer only concatenates it into rendered source.
  readonly typeText: string
  readonly name: string
}

export type HandlerParams = {
  // The full source range covering every parameter (commas included) inside
  // the handler's parentheses, e.g. for `(ctx, name: string)` it spans
  // `ctx, name: string`. 1-based.
  readonly range: Range
  // Each parameter's structured info, including the first (typically `ctx`).
  readonly params: ReadonlyArray<HandlerParam>
}

export type StepDef = {
  readonly file: string
  readonly expression: string
  readonly kind: StepKind
  readonly expressionRange: Range
  readonly callRange: Range
  // Optional because handlers in unusual forms (no parens, identifier-only
  // arrow, etc.) are skipped: we just won't sync those signatures.
  readonly handlerParams?: HandlerParams | undefined
}

export type ParameterTypeDef = {
  readonly file: string
  readonly name: string
  readonly regexp: string
  readonly callRange: Range
}
