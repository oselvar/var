import { steps } from '@oselvar/var'

// No state factory: these steps are pure — nothing to arrange, nothing to
// evolve — so steps() is called bare and handlers get an empty state.
const { stimulus, sensor } = steps()

stimulus('I warm up my mental math', () => {})

sensor('The square of {int} is {int}.', (_state, n: number) => [n, n * n])
