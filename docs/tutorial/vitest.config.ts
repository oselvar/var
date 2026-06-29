import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'
import { configDefaults, defineConfig } from 'vitest/config'

const root = new URL('../..', import.meta.url).pathname

export default defineConfig({
  plugins: [varPlugin({ cwd: root })],
  test: {
    include: ['**/*.md'],
    // 05-roman-numerals is a not-implemented exercise (see var.config.ts); the
    // plugin won't transform it, so keep vitest from collecting it as a test.
    exclude: [...configDefaults.exclude, '**/05-roman-numerals.md'],
    reporters: ['default', new VarResultsReporter({ cwd: root })],
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
