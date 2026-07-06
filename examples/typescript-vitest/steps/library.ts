export const FEE_PENCE_PER_DAY = 50

// `due` and the dates passed below are ISO dates like 2026-06-01 — immutable
// and comparable as plain strings.
export type Loan = {
  readonly title: string
  readonly due: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function lateFee(loan: Loan, returnedOn: string): number {
  const daysLate = Math.max(0, (Date.parse(returnedOn) - Date.parse(loan.due)) / MS_PER_DAY)
  return daysLate * FEE_PENCE_PER_DAY
}

export function mayBorrow(loans: ReadonlyArray<Loan>, on: string): boolean {
  return loans.every((loan) => loan.due >= on)
}
