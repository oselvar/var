export default {
  vars: {
    include: ['packages/var-examples/**/*.md'],
    // yahtzee.broken.md is a deliberately broken example; roman-numerals is a
    // not-implemented "your turn" exercise. Neither must run as a spec.
    exclude: [
      'packages/var-examples/yahtzee/yahtzee.broken.md',
      'packages/var-examples/roman-numerals/roman-numerals.md',
    ],
  },
  steps: ['packages/var-examples/**/*.steps.ts'],
}
