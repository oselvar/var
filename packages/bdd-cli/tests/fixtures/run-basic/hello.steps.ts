import { defineContext } from '@oselvar/bdd-runtime'

const { step } = defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

step('the greeting is {string}', (ctx, expected: string) => {
  if (ctx.greeting !== expected) {
    throw new Error(`expected ${expected}, got ${ctx.greeting}`)
  }
})
