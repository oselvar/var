import { defineState } from '@oselvar/var'

const { action } = defineState(() => ({}))

action('I greet {string}', () => {})
