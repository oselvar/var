import { defineState } from '@oselvar/var'
import { FEE_PENCE_PER_DAY, type Loan, lateFee, mayBorrow } from './library'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

// Custom parameter types are declared inline so their transformer return types
// flow into the steps: {date} → Date, {money} → pence, {title} → string. The
// step handlers below need no argument annotations as a result.
const { stimulus, sensor } = defineState(
  () => ({ loans: [] as ReadonlyArray<Loan>, feePence: 0, granted: false }),
  {
    date: {
      // June 6th → the ISO date 2026-06-06 (the spec's year is 2026)
      regexp:
        /(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:st|nd|rd|th)/,
      transformer: (raw: string) => {
        const [month = '', day = ''] = raw.split(' ')
        const mm = String(MONTHS.indexOf(month as (typeof MONTHS)[number]) + 1).padStart(2, '0')
        const dd = String(Number.parseInt(day, 10)).padStart(2, '0')
        return `2026-${mm}-${dd}`
      },
    },
    money: {
      // £2.50 and 50p, both as pence
      regexp: /£\d+(?:\.\d{2})?|\d+p/,
      transformer: (raw: string) =>
        raw.startsWith('£') ? Math.round(Number(raw.slice(1)) * 100) : Number.parseInt(raw, 10),
    },
    title: {
      // Emphasis (*Emma*) is stripped before matching, so a title is a
      // Title Case run in the plain prose
      regexp: /[A-Z][a-z]+(?: [A-Z][a-z]+)*/,
      transformer: (raw: string) => raw,
    },
  },
)

stimulus('borrowed {title}, due back on {date}', (state, title, due) => ({
  loans: [...state.loans, { title, due }],
}))

stimulus('returns it on {date}', (state, returnedOn) => ({
  feePence: state.loans.reduce((fee, loan) => fee + lateFee(loan, returnedOn), 0),
}))

sensor('owes a {money} late fee', (state) => state.feePence)

sensor('{money} for each day overdue', () => FEE_PENCE_PER_DAY)

stimulus('asks to borrow {title} on {date}', (state, _title, on) => ({
  granted: mayBorrow(state.loans, on),
}))

sensor('the library refuses', (state) => {
  if (state.granted) throw new Error('expected the library to refuse')
})

sensor('the library agrees', (state) => {
  if (!state.granted) throw new Error('expected the library to agree')
})
