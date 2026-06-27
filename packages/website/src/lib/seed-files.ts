// The step definitions + score() live in exactly one place — the dogfood
// tutorial file — and are imported verbatim. The file runs unchanged in both
// the vitest suite and the browser runner (the browser maps the
// `@oselvar/var-vitest` import to the runtime, and the step throws plain
// Errors rather than using vitest's `expect`).
import yahtzeeSteps from '../../../../docs/tutorial/steps/04-yahtzee.steps.ts?raw'

export const SEED_FILES: Record<string, string> = {
  '/yahtzee.var.md': `# Yahtzee

Five dice, one scorecard — and the same roll is worth wildly different things
depending on which box you score it in.

Each row lists the dice, the category, and the score:

| dice          | category       | score |
| ------------- | -------------- | ----- |
| 3, 3, 3, 4, 4 | full house     | 17    |
| 3, 3, 3, 4, 4 | threes         | 9     |
| 3, 3, 3, 4, 4 | fours          | 8     |
| 3, 3, 3, 3, 3 | full house     | 0     |
| 3, 3, 3, 3, 3 | Yahtzee        | 50    |
| 1, 2, 3, 4, 5 | small straight | 15    |

Five of a kind is **not** a full house — that box scores 0. Written under
Yahtzee, the same roll is a flat 50.
`,
  '/yahtzee.steps.ts': yahtzeeSteps,
}
