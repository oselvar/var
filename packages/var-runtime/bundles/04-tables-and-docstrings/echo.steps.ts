import { step } from '@oselvar/var-runtime'

// Returning the doc string makes the core compare it against the input
// (compareDocString); equal content passes.
step('I echo the following:', (_ctx, doc: string) => doc)
