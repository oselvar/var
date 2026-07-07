import { steps } from '@oselvar/var'
import { addMoney, FEE_PER_DAY, GBP, type Loan, lateFee, type Money, mayBorrow } from './library'

// Custom parameter types are declared with chained `.param()` calls so their
// parse return types flow into the steps: {date} → Date, {money} → Money,
// {title} → string. The step handlers below need no argument annotations as a
// result.
const { stimulus, sensor } = steps(() => ({
  loans: [] as ReadonlyArray<Loan>,
  fee: GBP(0),
  granted: false,
}))
  // June 6, 2026 ⇄ a Date. (Temporal.PlainDate would fit better — swap it
  // in once Node ships Temporal unflagged; today it's behind --harmony-temporal.)
  .param(
    'date',
    /[A-Z][a-z]+ \d{1,2}, \d{4}/,
    (raw) => new Date(raw),
    (d) => d.toLocaleDateString('en-US', { dateStyle: 'long' }),
  )
  // £2.50 and 50p, both as GBP Money. The amount is cucumber-expressions'
  // float regexp, minus the scientific notation. The inverse format renders
  // mismatches as £2.60 / 50p, not as a Money dump.
  .param(
    'money',
    /£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p/,
    (raw): Money =>
      raw.endsWith('p') ? GBP(Number.parseFloat(raw) / 100) : GBP(Number.parseFloat(raw.slice(1))),
    (m) => (m.value < 1 ? `${Math.round(m.value * 100)}p` : `£${m.value.toFixed(2)}`),
  )
  // The emphasised run IS the parameter: the markers live in the pattern,
  // parse strips them, format restores them. Markup is notation, like £2.50.
  .param(
    'title',
    /\*[^*]+\*/,
    (raw) => raw.slice(1, -1),
    (t) => `*${t}*`,
  )

stimulus('borrowed {title}, due back on {date}', (state, title, due) => ({
  loans: [...state.loans, { title, due }],
}))

stimulus('returns it on {date}', (state, returnedOn) => ({
  fee: state.loans.reduce((fee, loan) => addMoney(fee, lateFee(loan, returnedOn)), GBP(0)),
}))

sensor('owes a {money} late fee', (state) => state.fee)

sensor('{money} for each day overdue', () => FEE_PER_DAY)

stimulus('asks to borrow {title} on {date}', (state, _title, on) => ({
  granted: mayBorrow(state.loans, on),
}))

sensor('the library refuses', (state) => {
  if (state.granted) throw new Error('expected the library to refuse')
})

sensor('the library agrees', (state) => {
  if (!state.granted) throw new Error('expected the library to agree')
})
