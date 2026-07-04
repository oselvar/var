import { defineState } from '@oselvar/var'

// import { Library } from '../src/library'

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
// flow into the steps: {date} → Date, {money} → number, {title} → string. The
// step handlers below need no argument annotations as a result.
const { stimulus, sensor } = defineState(
  () => ({
    // library: new Library(),
    member: 'maya',
  }),
  {
    date: {
      regexp:
        /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})(?:st|nd|rd|th)/,
      transformer: (month: string, day: string) =>
        new Date(Date.UTC(2026, MONTHS.indexOf(month as (typeof MONTHS)[number]), Number(day))),
    },
    money: {
      // pence: matches £3.50 and 50p
      regexp: /£(\d+(?:\.\d{2})?)|(\d+)p/,
      transformer: (pounds: string | undefined, pence: string | undefined) =>
        pounds !== undefined ? Math.round(Number(pounds) * 100) : Number(pence),
    },
    title: {
      // markdown emphasis doubles as the parameter boundary
      regexp: /\*([^*]+)\*/,
      transformer: (title: string) => title,
    },
  },
)

stimulus('Maya has borrowed {string}, due back on {date}', (_state, _title, _due) => {
  // ctx.library.checkOut(ctx.member, title, due)
})

stimulus('she returns it on {date}', (_state, _returned) => {
  // ctx.library.checkIn(ctx.member, returned)
})

sensor('charges her a {money} late fee', (_state, _fee) => {
  // expect(ctx.library.feesOwedBy(ctx.member)).toBe(fee)
})

sensor('{money} for each day overdue', (_state, _dailyRate) => {
  // ...
})

sensor('Her account shows the fee', (_state) => {
  // expect(ctx.library.accountOf(ctx.member).fees).toBeGreaterThan(0)
})

sensor("she can't borrow anything else", (_state) => {
  // expect(() => ctx.library.checkOut(...)).toThrow(/unpaid/i)
})
