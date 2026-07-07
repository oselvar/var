import { steps } from '@oselvar/var'

// Custom {money} parameter type with a `format` — the inverse of `parse`,
// rendering a value back in the document's notation. The sensor
// returns the WRONG Money on purpose: the golden pins the formatted actual
// ("£2.60"), proving every port renders parameter mismatches through
// `format` identically. Without a format this actual would be each port's
// native object rendering, which is deliberately outside conformance.
type Money = { readonly currency: string; readonly value: number }

const { sensor } = steps(() => ({})).param(
  'money',
  /£\d+\.\d{2}/,
  (raw): Money => ({ currency: 'GBP', value: Number.parseFloat(raw.slice(1)) }),
  (m) => `£${m.value.toFixed(2)}`,
)

sensor('The late fee is {money}', (): Money => ({ currency: 'GBP', value: 2.6 }))
