import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

// Intentionally returns the captured values unchanged → the example passes.
// Flip 3 → 4 in the return to see the span-anchored CellMismatch on {int}.
sensor('I should have {int} cukes in my {word} belly', (_state, count, name) => [count, name])
