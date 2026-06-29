import { defineState } from '@oselvar/var-vitest'

const { sensor } = defineState(() => ({}))

// Whole-table mode: the table arrives as string[][] (header row first). Return
// the tuple [reproducedTable] — Vár compares every cell against the spec.
sensor('Uppercase each one:', (_state, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const reproduced = rows
    .slice(1)
    .map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
  return [reproduced]
})

// Doc-string mode: the post-ctx args are (name, body); return [name, text].
// `name` is inferred from {word}; `_body` is the trailing doc-string arg (no
// placeholder in the expression), so it keeps its annotation.
sensor('Greet {word}:', (_state, name, _body: string) => {
  return [name, `Hello, ${name}!\n`]
})
