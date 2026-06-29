import { defineParameterType, defineState } from '@oselvar/var-vitest'

defineParameterType({
  name: 'airport',
  regexp: /[A-Z]{3}/,
  transformer: (code: string) => code,
})

const { action, sensor } = defineState(() => ({ from: '', to: '' }))

action('I fly from {airport} to {airport}', (ctx, from: string, to: string) => {
  ctx.from = from
  ctx.to = to
})

sensor(
  'the route should be from {airport} to {airport}',
  (ctx, _from: string, _to: string) => [ctx.from, ctx.to] as [string, string],
)
