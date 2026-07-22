import { isCellMismatchError } from './cell-diff.ts'
import type { Span } from './span.ts'

// Where a failure POINTS in the .md: a mismatch anchors at its first failing
// span (a table cell, an inline capture, or a doc string's fence body), anything
// else at the fallback —
// the step's match start. This rule is the single source of truth for failure
// locations: the executor's stack augmentation renders it per-runtime, and the
// conformance trace pins it as `failure.anchor`, so every language port must
// reproduce it byte-for-byte.
export function failureAnchor(error: unknown, fallback: Span): Span {
  if (isCellMismatchError(error)) return error.cells.find((c) => !c.ok)?.span ?? fallback
  return fallback
}
