import { step } from '@oselvar/var-runtime'

// Returns the WRONG string; the core compares it to the doc string and throws
// DocStringMismatchError → trace failure.kind "doc-string-mismatch".
step('I echo the following:', () => 'goodbye')
