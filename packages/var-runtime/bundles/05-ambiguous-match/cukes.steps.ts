import { step } from '@oselvar/var-runtime'

// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
step('I have {int} cukes', () => {})
step('I have 5 cukes', () => {})
