import { ReturnShapeError } from './cell-diff.js'
import type { Span } from './span.js'

// A doc-string content difference: the fence body's source range plus the
// expected (authored) and actual (returned) strings.
export type DocStringDiff = {
  readonly span: Span
  readonly expected: string
  readonly actual: string
}

// Compare a doc-string step's returned string against the fence body content.
// Exact equality (the body includes its trailing newline). `undefined` → no
// check (null). A non-string return is an author mistake → ReturnShapeError.
export function compareDocString(
  returned: unknown,
  content: string,
  span: Span,
): DocStringDiff | null {
  if (returned === undefined) return null
  if (typeof returned !== 'string') {
    throw new ReturnShapeError(`expected a doc string (string), got ${typeof returned}`)
  }
  if (returned === content) return null
  return { span, expected: content, actual: returned }
}

// Thrown by the executor when a doc-string step's returned string differs.
export class DocStringMismatchError extends Error {
  readonly diff: DocStringDiff
  constructor(diff: DocStringDiff) {
    super(
      `doc string: expected ${JSON.stringify(diff.expected)} but was ${JSON.stringify(diff.actual)}`,
    )
    this.name = 'DocStringMismatchError'
    this.diff = diff
  }
}

export function isDocStringMismatchError(e: unknown): e is DocStringMismatchError {
  return e instanceof DocStringMismatchError
}
