import { defineContext } from '@oselvar/var-vitest'

const { step } = defineContext(() => ({}))

// Whole-table mode: the table arrives as string[][] (header row first). Return
// the full computed table — Vár compares every cell against the spec.
step('Uppercase each one:', (_ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  return rows.slice(1).map(([before]) => ({ before, after: (before ?? '').toUpperCase() }))
})

// Doc-string mode: return the exact text the fence should contain. Fence bodies
// include their trailing newline, so the returned string ends in "\n" too.
step('Greet {word}:', (_ctx, name: string, _body: string) => `Hello, ${name}!\n`)
