import { defineState } from '@oselvar/var'

const { action } = defineState(() => ({}))

// The prose matches no step, so the `error` fence (which marks the example
// expected-to-fail) has nothing to run → error-fence-without-step diagnostic,
// and the example is dropped.
action('I have {int} cukes', () => {})
