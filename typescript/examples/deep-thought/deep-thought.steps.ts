import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({ greeting: '', result: 0 }))

sensor('life, the universe and everything is {int}', () => 42)
