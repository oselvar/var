import { defineState } from '@oselvar/var'

const { stimulus, sensor } = defineState(() => ({ greeting: '', result: 0 }))

stimulus('I greet {string}', (_state, name) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting should be {string}', (state, _expected) => state.greeting)

stimulus('expression `{int}+{int}`', (_state, op1, op2) => ({ result: op1 + op2 }))

sensor('evaluate to `{int}`', (state, _count) => state.result)
