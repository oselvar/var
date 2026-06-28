import { defineState } from '@oselvar/var-vitest'
import { expect } from 'vitest'
import { type Book, type BorrowError, Library, type Receipt } from '../src/library.js'

const { context, action, sensor } = defineState(() => ({
  library: new Library(new Date('2026-06-12T00:00:00Z')),
  lastReceipt: undefined as Receipt | BorrowError | undefined,
}))

context('the library has these books:', (ctx, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const [header, ...body] = rows
  if (!header) return
  const books = body.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])),
  ) as Book[]
  ctx.library.addBooks(books)
})

action('the member borrows {string}', (ctx, title: string) => {
  ctx.lastReceipt = ctx.library.borrow(title)
})

sensor('the receipt is:', (ctx, _docString: string) => {
  // Assertion-style sensor (returns void): compares via expect, not by return.
  expect(ctx.lastReceipt).toEqual(JSON.parse(_docString))
})
