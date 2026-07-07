import { steps } from '@oselvar/var'

// The custom `{airport}` parameter type is declared with a chained `.param()`
// call, so Vár can infer the captured args: the parse function returns string,
// so `from`/`to` are typed string with no annotation.
const { stimulus, sensor } = steps(() => ({ from: '', to: '' })).param(
  'airport',
  /[A-Z]{3}/,
  (code) => code,
)

stimulus('I fly from {airport} to {airport}', (_state, from, to) => ({ from, to }))

sensor('the route should be from {airport} to {airport}', (state, _from, _to) => [
  state.from,
  state.to,
])
