import { steps } from '@oselvar/var'

const { stimulus } = steps(() => ({}))

stimulus('I divide {int} by {int}', (_ctx, _a: number, b: number) => {
  if (b === 0) throw new Error('division by zero')
})
