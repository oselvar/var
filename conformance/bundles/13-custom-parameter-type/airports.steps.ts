import { steps } from '@oselvar/var'

// Custom {airport} parameter type: IATA code, lowercased by the parse function.
// The lowercasing is asserted by the sensor (the .md says "lhr"), so an
// identity parse fails this bundle — proving parse functions execute.
const { stimulus, sensor } = steps<{ dest?: string }>(() => ({})).param(
  'airport',
  /[A-Z]{3}/,
  (code) => code.toLowerCase(),
)

stimulus('I fly to {airport}', (_state, dest: string) => ({ dest }))

sensor('The destination code is {word}', (state, expected: string) => {
  // {word} greedily captures the sentence-ending period (same cleanup as
  // bundle 01) — strip it before comparing.
  const cleaned = expected.replace(/[.!?]$/, '')
  if (state.dest !== cleaned) throw new Error(`expected ${cleaned} but got ${state.dest}`)
})
