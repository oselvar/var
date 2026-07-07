import { steps } from '@oselvar/var'

const { sensor } = steps<Record<string, never>>(() => ({}))
sensor('I greet {string}', () => undefined)
