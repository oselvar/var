import { defineState } from '@oselvar/var-vitest'

// Declaring the custom `{airport}` parameter type here (rather than via a
// separate defineParameterType call) lets Vár infer the captured args: the
// transformer returns string, so `from`/`to` are typed string with no annotation.
const { action, sensor } = defineState(() => ({ from: '', to: '' }), {
  airport: { regexp: /[A-Z]{3}/, transformer: (code: string) => code },
})

action('I fly from {airport} to {airport}', (ctx, from, to) => {
  ctx.from = from
  ctx.to = to
})

sensor('the route should be from {airport} to {airport}', (ctx, _from, _to) => [ctx.from, ctx.to])
