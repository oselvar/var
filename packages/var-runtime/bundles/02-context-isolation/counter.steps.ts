import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext<{ count: number }>(() => ({ count: 0 }))

step('I increment', (ctx) => {
  ctx.count += 1
})

step('The count is {int}', (ctx, n: number) => {
  if (ctx.count !== n) throw new Error(`expected ${n} but got ${ctx.count}`)
})
