import { defineState } from '@oselvar/var-runtime'

const { action, sensor } = defineState(() => ({ greeting: '' }))

action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

sensor('the greeting is {string}', (ctx, _expected: string) => [ctx.greeting] as [string])
