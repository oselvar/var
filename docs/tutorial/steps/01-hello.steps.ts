import { defineContext } from '@oselvar/bdd-vitest'

const { step } = defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

step('the greeting should be {string}', (ctx, expected: string) => {
  if (ctx.greeting !== expected) {
    throw new Error(`Expected ${expected}, got ${ctx.greeting}`)
  }
})
