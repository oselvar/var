import { steps } from '@oselvar/var'
import { toRoman } from './roman-numerals'

const { sensor } = steps()

sensor('a decimal and a roman number', (_state, row: { decimal: string; roman: string }) => {
  return { decimal: row.decimal, roman: toRoman(Number(row.decimal)) }
})
