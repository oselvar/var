import { action } from '@oselvar/var-runtime'

action('I divide {int} by {int}', (_ctx, _a: number, b: number) => {
  if (b === 0) throw new Error('division by zero')
})
