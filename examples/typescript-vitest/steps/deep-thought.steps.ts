import { steps } from '@oselvar/var'

const { sensor } = steps()

sensor('life, the universe and everything is {int}', () => 42)
