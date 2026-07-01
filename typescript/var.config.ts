export default {
  vars: {
    include: ['packages/var-examples/**/*.md'],
    // yahtzee.broken.md is a deliberately broken example; it must not run as a spec.
    exclude: ['packages/var-examples/yahtzee/yahtzee.broken.md'],
  },
  steps: ['packages/var-examples/**/*.steps.ts'],
}
