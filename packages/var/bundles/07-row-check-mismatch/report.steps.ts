import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

// Header-bound row step: returns its computed columns; the core diffs them
// against the row cells (rowChecks path). score 99 ≠ 10 → CellMismatchError → "cell-mismatch".
sensor('I report the score and grade', () => ({ score: '99', grade: 'A' }))
