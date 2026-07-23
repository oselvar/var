import { steps } from '@varar/varar'

// The two Given/And paragraphs each carry a table and are separated from each
// other by a blank line (valid GFM). They must merge into ONE example that
// shares state, so the sensor reads back 1 user and 1 asset. The second example
// — separated by the prose paragraph — starts from a fresh, empty basket and
// reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
type Basket = { readonly users: ReadonlyArray<string>; readonly assets: ReadonlyArray<string> }

const { stimulus, sensor } = steps<Basket>(() => ({ users: [], assets: [] }))

stimulus(
  'the following users have been imported',
  (state, rows: ReadonlyArray<ReadonlyArray<string>>) => ({
    ...state,
    users: rows.slice(1).map((r) => r[0] ?? ''),
  }),
)

stimulus(
  'the following assets have been imported',
  (state, rows: ReadonlyArray<ReadonlyArray<string>>) => ({
    ...state,
    assets: rows.slice(1).map((r) => r[0] ?? ''),
  }),
)

sensor('the basket contains {int} user(s) and {int} asset(s)', (state) => [
  state.users.length,
  state.assets.length,
])
