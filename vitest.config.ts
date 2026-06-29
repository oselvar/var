import { defineConfig } from 'vitest/config'
import { VarResultsReporter } from './packages/var-vitest/src/reporter.js'

const root = new URL('.', import.meta.url).pathname

// Vitest 4 replaced `vitest.workspace.ts` + `defineWorkspace` with `test.projects`.
// Reporters are root-level in vitest 4 workspace mode — project reporters are ignored.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    reporters: ['default', new VarResultsReporter({ cwd: root })],
  },
})
