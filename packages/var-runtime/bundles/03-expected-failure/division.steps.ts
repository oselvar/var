import { step } from '@oselvar/var-runtime'

step('I divide {int} by {int}', (_ctx, _a: number, b: number) => {
  if (b === 0) throw new Error('division by zero')
})
