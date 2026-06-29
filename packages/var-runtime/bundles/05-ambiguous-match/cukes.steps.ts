import { action } from '@oselvar/var-runtime'

// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
action('I have {int} cukes', () => {})
action('I have 5 cukes', () => {})
