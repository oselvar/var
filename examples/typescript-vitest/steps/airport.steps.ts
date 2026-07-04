import { defineState } from '@oselvar/var'

// The custom `{airport}` parameter type is declared in defineState's second
// argument, so Vár can infer the captured args: the transformer returns string,
// so `from`/`to` are typed string with no annotation.
const { stimulus, sensor } = defineState(() => ({ from: '', to: '' }), {
  airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code },
})

stimulus('I fly from {airport} to {airport}', (_state, from, to) => ({ from, to }))

sensor('the route should be from {airport} to {airport}', (state, _from, _to) => [
  state.from,
  state.to,
])
