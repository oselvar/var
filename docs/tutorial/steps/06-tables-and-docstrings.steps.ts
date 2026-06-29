import { defineState } from '@oselvar/var-vitest'

const { sensor } = defineState(() => ({}))

// Whole-table mode: the table arrives as string[][] (header row first). Return
// the tuple [reproducedTable] — Vár compares every cell against the spec.
sensor('Uppercase each one:', (_ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const reproduced = rows.slice(1).map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
  return [reproduced] as const
})

// Doc-string mode: the post-ctx args are (name, body); return [name, text].
sensor('Greet {word}:', (_ctx, name: string, _body: string) => {
  return [name, `Hello, ${name}!\n`] as [string, string]
})
