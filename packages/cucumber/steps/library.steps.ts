import { defineContext } from '@oselvar/bdd-vitest'
import { expect } from 'vitest'
import { type Book, Library, type BorrowError, type Receipt } from '../src/library.js'

// Cucumber's Before/After hooks → bdd-vitest's defineContext factory. The
// factory runs once per example (vitest runs each example as its own test),
// so it's the natural place to reset state. There's no After equivalent
// because the per-example context goes out of scope when the test ends.
const { step } = defineContext(() => ({
  library: new Library(new Date('2026-06-12T00:00:00Z')),
  lastReceipt: undefined as Receipt | BorrowError | undefined,
}))

step('the library has these books:', (ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  // The runtime hands us `[header, ...body]` as a string[][]. Convert to
  // typed Book objects ourselves; cucumber-js's DataTable.hashes() did this
  // implicitly, but explicit is cheap.
  const [header, ...body] = rows
  if (!header) return
  const books = body.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])),
  ) as Book[]
  ctx.library.addBooks(books)
})

step('the member borrows {string}', (ctx, title: string) => {
  ctx.lastReceipt = ctx.library.borrow(title)
})

step('the receipt is:', (ctx, docString: string) => {
  expect(ctx.lastReceipt).toEqual(JSON.parse(docString))
})
