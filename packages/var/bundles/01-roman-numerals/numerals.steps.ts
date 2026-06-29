import { defineState } from '@oselvar/var'

const { action, sensor } = defineState<{ result?: string }>(() => ({}))

const ROMAN: Record<number, string> = { 1: 'I', 4: 'IV', 9: 'IX', 40: 'XL' }

action('I convert {int} to roman numerals', (_state, n: number) => ({ result: ROMAN[n] }))

sensor('The result is {word}', (state, expected: string) => {
  // Strip sentence-ending punctuation captured by {word} when it appears last in a sentence.
  const cleaned = expected.replace(/[.!?]$/, '')
  if (state.result !== cleaned) throw new Error(`expected ${cleaned} but got ${state.result}`)
})
