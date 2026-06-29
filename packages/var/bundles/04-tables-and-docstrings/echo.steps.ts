import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

// Returning the doc string (as the post-ctx tuple) makes the core compare it
// against the input (compareDocString); equal content passes.
sensor('I echo the following:', (_ctx, doc: string) => [doc])
