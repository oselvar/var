import { defineState } from '@oselvar/var'

const { action, sensor } = defineState(() => ({ greeting: '', result: 0 }))

action('I greet {string}', (_state, name) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting should be {string}', (state, _expected) => [state.greeting])

action('expression `{int}+{int}`', (_state, op1, op2) => ({ result: op1 + op2 }))

sensor('evaluate to `{int}`', (state, _count) => [state.result])
