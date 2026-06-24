import { strict as assert } from 'node:assert'
import { After, Before, type DataTable, Given, Then, When } from '@cucumber/cucumber'
import { type Book, type BorrowError, Library, type Receipt } from '../../src/library.js'

// Cucumber gives you stateful step bodies via module-scope variables (or a
// World). The Before/After hooks reset between scenarios.
let library: Library | undefined
let lastReceipt: Receipt | BorrowError | undefined

Before(() => {
  // 2026-06-12 (fixed); receipts therefore have due = 2026-06-19.
  library = new Library(new Date('2026-06-12T00:00:00Z'))
  lastReceipt = undefined
})

After(() => {
  library = undefined
  lastReceipt = undefined
})

Given('the library has these books:', (table: DataTable) => {
  assert.ok(library)
  library.addBooks(table.hashes() as ReadonlyArray<Book>)
})

When('the member borrows {string}', (title: string) => {
  assert.ok(library)
  lastReceipt = library.borrow(title)
})

Then('the receipt is:', (docString: string) => {
  assert.deepEqual(lastReceipt, JSON.parse(docString))
})
