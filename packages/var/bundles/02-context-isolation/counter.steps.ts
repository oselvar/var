import { defineState } from '@oselvar/var'

const { action, sensor } = defineState<{ count: number }>(() => ({ count: 0 }))

action('I increment', (state) => ({ count: state.count + 1 }))

sensor('The count is {int}', (state, n: number) => {
  if (state.count !== n) throw new Error(`expected ${n} but got ${state.count}`)
})
