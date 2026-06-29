import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

// Returns the WRONG string (as the post-ctx tuple); the core compares it to the
// doc string and throws DocStringMismatchError → trace failure.kind "doc-string-mismatch".
sensor('I echo the following:', (_ctx, _doc: string) => ['goodbye'])
