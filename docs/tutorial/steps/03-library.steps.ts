import { defineContext, defineParameterType } from '@oselvar/var-vitest'

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

defineParameterType({
  name: 'date',
  regexp:
    /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})(?:st|nd|rd|th)/,
  transformer: (month, day) =>
    new Date(Date.UTC(2026, MONTHS.indexOf(month as (typeof MONTHS)[number]), Number(day))),
})

defineParameterType({
  name: 'money', // pence: matches £3.50 and 50p
  regexp: /£(\d+(?:\.\d{2})?)|(\d+)p/,
  transformer: (pounds, pence) =>
    pounds !== undefined ? Math.round(Number(pounds) * 100) : Number(pence),
})

defineParameterType({
  name: 'title', // markdown emphasis doubles as the parameter boundary
  regexp: /\*([^*]+)\*/,
  transformer: (title) => title,
})

const { step } = defineContext(() => ({
  // library: new Library(),
  member: 'maya',
}))

step('Maya has borrowed {string}, due back on {date}', (_ctx, _title: string, _due: Date) => {
  // ctx.library.checkOut(ctx.member, title, due)
})

step('she returns it on {date}', (_ctx, _returned: Date) => {
  // ctx.library.checkIn(ctx.member, returned)
})

step('charges her a {money} late fee', (_ctx, _fee: number) => {
  // expect(ctx.library.feesOwedBy(ctx.member)).toBe(fee)
})

step('{money} for each day overdue', (_ctx, _dailyRate: number) => {
  // const { dueDate, returnedDate } = ctx.library.lastLoanOf(ctx.member)
  // const daysOverdue = (returnedDate.getTime() - dueDate.getTime()) / 86_400_000
  // expect(ctx.library.feesOwedBy(ctx.member)).toBe(dailyRate * daysOverdue)
})

step('Her account shows the fee', (_ctx) => {
  // expect(ctx.library.accountOf(ctx.member).fees).toBeGreaterThan(0)
})

step("she can't borrow anything else", (_ctx) => {
  // expect(() => ctx.library.checkOut(ctx.member, 'Anything', new Date())).toThrow(/unpaid/i)
})
