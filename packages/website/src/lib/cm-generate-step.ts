import type { ChangeSpec } from '@codemirror/state'

// Pure: compute the change that appends `fullCode` to the end of `stepsDoc`,
// separated from existing content by exactly one blank line, with a trailing
// newline. Returns the change plus the [from, to) offsets of the inserted
// block in the resulting document.
export function appendStepDef(
  stepsDoc: string,
  fullCode: string,
): { changes: ChangeSpec; from: number; to: number } {
  const block = fullCode.trim()
  const body = stepsDoc.replace(/\s*$/, '') // existing content without trailing whitespace
  if (body.length === 0) {
    return { changes: { from: 0, to: stepsDoc.length, insert: `${block}\n` }, from: 0, to: block.length }
  }
  const insert = `\n\n${block}\n`
  const from = body.length + 2
  return { changes: { from: body.length, to: stepsDoc.length, insert }, from, to: from + block.length }
}
