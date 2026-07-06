import { defineState } from '@oselvar/var'

// No state factory: these steps are pure — nothing to arrange, nothing to
// evolve — so defineState() is called bare and handlers get an empty state.
const { stimulus, sensor } = defineState()

stimulus('I warm up my mental math', () => {})

sensor('The square of {int} is {int}.', (_state, n: number) => [n, n * n])
