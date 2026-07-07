import { steps } from '@oselvar/var'
import { score } from './yahtzee'

const { sensor } = steps()

// Header-bound table: the paragraph names every header cell (dice, category,
// score), so the runner calls this sensor once per row with the row as an
// object of raw strings. Returning { score } compares only that column.
sensor(
  'Examples of dice, category and score',
  (_state, row: { dice: string; category: string; score: string }) => {
    const dice = row.dice.split(',').map((d) => Number(d.trim()))
    return { score: score(dice, row.category) }
  },
)
