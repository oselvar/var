import { steps } from '@oselvar/var'

const { sensor } = steps(() => ({}))

// The doc string is this sensor's only slot, so it is returned bare; the core
// compares it against the input (compareDocString); equal content passes.
sensor('I echo the following:', (_ctx, doc: string) => doc)
