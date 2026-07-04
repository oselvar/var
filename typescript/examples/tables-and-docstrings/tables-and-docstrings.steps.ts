import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

// Whole-table mode: the table arrives as string[][] (header row first). It is
// this sensor's only slot, so return the reproduced table bare — Vár compares
// every cell against the spec.
sensor('Uppercase each one:', (_state, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  return rows.slice(1).map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
})

// Doc-string mode: the post-state args are (name, body); return [name, text].
// `name` is inferred from {word}; `_body` is the trailing doc-string arg (no
// placeholder in the expression), so it keeps its annotation.
sensor('Greet {word}:', (_state, name, _body: string) => {
  return [name, `Hello, ${name}!\n`]
})
