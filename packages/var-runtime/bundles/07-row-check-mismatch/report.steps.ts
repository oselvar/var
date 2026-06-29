import { step } from '@oselvar/var-runtime'

// Header-bound row step: returns its computed columns; the core diffs them
// against the row cells. score 99 ≠ 10 → CellMismatchError → "cell-mismatch".
step('I report the score and grade', () => ({ score: '99', grade: 'A' }))
