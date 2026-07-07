import { steps } from '@oselvar/var'

const { stimulus } = steps(() => ({ count: 0 }))

stimulus('I have {int} items', (_state, _count: number) => {})
