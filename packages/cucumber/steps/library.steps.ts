import { defineState } from '@oselvar/var'
import { expect } from 'vitest'
import { type Book, type BorrowError, Library, type Receipt } from '../src/library.js'

const { context, action, sensor } = defineState(() => ({
  library: new Library(new Date('2026-06-12T00:00:00Z')),
  lastReceipt: undefined as Receipt | BorrowError | undefined,
}))

context('the library has these books:', (state, rows: ReadonlyArray<ReadonlyArray<string>>) => {
  const [header, ...body] = rows
  if (!header) return
  const books = body.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])),
  ) as Book[]
  // `library` is a class instance — left live by deepFreeze — so this side
  // effect on its internal shelf is allowed. The step returns nothing.
  state.library.addBooks(books)
})

action('the member borrows {string}', (state, title: string) => ({
  lastReceipt: state.library.borrow(title),
}))

sensor('the receipt is:', (state, _docString: string) => {
  // Assertion-style sensor (returns void): compares via expect, not by return.
  expect(state.lastReceipt).toEqual(JSON.parse(_docString))
})
