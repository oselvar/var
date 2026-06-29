import { defineState } from '@oselvar/var'

const { action, sensor } = defineState(() => ({ greeting: '' }))

action('I greet {string}', (_ctx, name: string) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting is {string}', (state, _expected: string) => [state.greeting] as [string])
