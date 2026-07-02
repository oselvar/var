import { defineState } from '@oselvar/var'

// Custom {airport} parameter type: IATA code, lowercased by the transformer.
// The lowercasing is asserted by the sensor (the .md says "lhr"), so an
// identity transformer fails this bundle — proving transformers execute.
const { action, sensor } = defineState<{ dest?: string }>(() => ({}), {
  airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code.toLowerCase() },
})

action('I fly to {airport}', (_state, dest: string) => ({ dest }))

sensor('The destination code is {word}', (state, expected: string) => {
  // {word} greedily captures the sentence-ending period (same cleanup as
  // bundle 01) — strip it before comparing.
  const cleaned = expected.replace(/[.!?]$/, '')
  if (state.dest !== cleaned) throw new Error(`expected ${cleaned} but got ${state.dest}`)
})
