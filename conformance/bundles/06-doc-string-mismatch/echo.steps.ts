import { steps } from '@oselvar/var'

const { sensor } = steps(() => ({}))

// Returns the WRONG string (bare — the doc string is the only slot); the core
// compares it to the doc string and throws DocStringMismatchError → trace
// failure.kind "doc-string-mismatch".
sensor('I echo the following:', (_ctx, _doc: string) => 'goodbye')
