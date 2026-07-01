import { diffChars } from 'diff'

// A single keystroke-sized edit. Coordinates are sequential: each op is valid
// against the document as it stands the moment it is applied (after all prior
// ops). `insert.text` is always exactly one character.
export type ReplayOp = { kind: 'insert'; at: number; text: string } | { kind: 'delete'; at: number }

// Plan the character-by-character transformation of `from` into `to`, in
// left-to-right document order, as if a person were typing the change.
//
// Pure and deterministic: no DOM, no timers. Uses jsdiff's minimal char diff,
// then walks the segments maintaining an evolving caret:
//   - equal   -> advance the caret past it
//   - removed -> delete the segment right-to-left, one char per op, so it reads
//                like pressing Backspace (the caret walks left from the right
//                end of the run) rather than forward Delete at a stationary
//                caret. The caret ends back at the segment start.
//   - added   -> insert one char at the caret per char, advancing the caret
export function planReplay(from: string, to: string): ReplayOp[] {
  const ops: ReplayOp[] = []
  let caret = 0
  for (const part of diffChars(from, to)) {
    if (part.added) {
      for (const ch of part.value) {
        ops.push({ kind: 'insert', at: caret, text: ch })
        caret += 1
      }
    } else if (part.removed) {
      for (let j = part.value.length - 1; j >= 0; j--) {
        ops.push({ kind: 'delete', at: caret + j })
      }
    } else {
      caret += part.value.length
    }
  }
  return ops
}
