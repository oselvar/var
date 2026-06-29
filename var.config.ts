export default {
  // `!`-prefixed globs exclude. 05-roman-numerals is a deliberately
  // not-implemented "your turn" exercise, so it must not run as a spec.
  vars: ['docs/tutorial/**/*.md', '!docs/tutorial/05-roman-numerals.md'],
  steps: ['docs/tutorial/**/*.steps.ts'],
}
