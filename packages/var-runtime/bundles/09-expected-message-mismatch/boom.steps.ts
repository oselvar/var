import { step } from '@oselvar/var-runtime'

// Throws a message that does NOT contain the expected substring "expected
// message", so the expected-failure is NOT satisfied → the example fails.
step('I always boom', () => {
  throw new Error('actual different error')
})
