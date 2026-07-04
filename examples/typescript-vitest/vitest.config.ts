import varPlugin from '@oselvar/var-vitest'
import { defineConfig } from 'vitest/config'

// The repo root: var.config.json lives there so its globs can reach the
// language-neutral corpus in doc/examples/ and the steps in this package.
const root = new URL('../..', import.meta.url).pathname

// The var plugin reads var.config.json and drives vitest's include/exclude from
// its `vars` globs, so there's nothing to list here — var.config.json is the
// single source of truth for which `.md` files are specs.
//
// No reporter here: in vitest 4 workspace mode reporters are root-level only
// (project reporters are ignored), so VarResultsReporter lives in the root
// vitest.config.ts and collects every project's results, this one included.
export default defineConfig({
  plugins: [varPlugin({ cwd: root })],
  resolve: {
    // The specs in doc/examples/ sit above the pnpm workspace, so node can't
    // resolve @oselvar/var-vitest/runtime by walking up from the .md file the
    // way a real consumer project would — alias it to the workspace source.
    alias: {
      '@oselvar/var-vitest/runtime': new URL(
        './typescript/packages/var-vitest/src/runtime.ts',
        `file://${root}`,
      ).pathname,
    },
  },
  test: {
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
