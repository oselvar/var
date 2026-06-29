import { defineState } from '@oselvar/var'

const { action } = defineState(() => ({}))

// Throws a message that does NOT contain the expected substring "expected
// message", so the expected-failure is NOT satisfied → the example fails.
action('I always boom', () => {
  throw new Error('actual different error')
})
