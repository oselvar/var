import varPlugin from '@oselvar/var-vitest'
import { defineConfig } from 'vitest/config'

const root = new URL('../..', import.meta.url).pathname

// The var plugin reads var.config.ts and drives vitest's include/exclude from
// its `vars` globs, so there's nothing to list here — var.config.ts is the
// single source of truth for which `.md` files are specs.
//
// No reporter here: in vitest 4 workspace mode reporters are root-level only
// (project reporters are ignored), so VarResultsReporter lives in the root
// vitest.config.ts and collects every project's results, this one included.
export default defineConfig({
  plugins: [varPlugin({ cwd: root })],
  test: {
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
