import { defineState } from '@oselvar/var-runtime'

const { action, sensor } = defineState<{ count: number }>(() => ({ count: 0 }))

action('I increment', (ctx) => {
  ctx.count += 1
})

sensor('The count is {int}', (ctx, n: number) => {
  if (ctx.count !== n) throw new Error(`expected ${n} but got ${ctx.count}`)
})
