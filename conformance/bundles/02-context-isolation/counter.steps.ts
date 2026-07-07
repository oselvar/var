import { steps } from '@oselvar/var'

const { stimulus, sensor } = steps<{ count: number }>(() => ({ count: 0 }))

stimulus('I increment', (state) => ({ count: state.count + 1 }))

sensor('The count is {int}', (state, n: number) => {
  if (state.count !== n) throw new Error(`expected ${n} but got ${state.count}`)
})
