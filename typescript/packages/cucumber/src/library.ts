// Tiny domain shared between the Cucumber and the var stepdef sets. Both
// runners exercise the exact same Library instance behaviour; only the
// glue layer differs.

export type Book = { readonly title: string; readonly author: string }

// The library returns this JSON shape from `borrow()`. The receipt's `due`
// is computed deterministically (issueDate + LOAN_PERIOD_DAYS) so the
// scenarios can assert against a known value.
export type Receipt = { readonly ok: true; readonly due: string }
export type BorrowError = { readonly ok: false; readonly reason: 'not-on-shelf' }

const LOAN_PERIOD_DAYS = 7

export class Library {
  private readonly shelf: Book[] = []
  // Today is fixed by the test (Cucumber's Before hook / vitest's
  // beforeEach) so receipts stay reproducible.
  constructor(private readonly today: Date) {}

  addBooks(books: ReadonlyArray<Book>): void {
    this.shelf.push(...books)
  }

  borrow(title: string): Receipt | BorrowError {
    const idx = this.shelf.findIndex((b) => b.title === title)
    if (idx === -1) return { ok: false, reason: 'not-on-shelf' }
    this.shelf.splice(idx, 1)
    const due = new Date(this.today)
    due.setUTCDate(due.getUTCDate() + LOAN_PERIOD_DAYS)
    return { ok: true, due: due.toISOString().slice(0, 10) }
  }
}
