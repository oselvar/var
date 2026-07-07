import { steps } from '@oselvar/var'

const { stimulus, sensor } = steps(() => ({ greeting: '' }))

stimulus('I greet {string}', (_ctx, name: string) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting is {string}', (state, _expected: string) => state.greeting)
