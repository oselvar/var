import bdd from '@oselvar/bdd-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Point the plugin at THIS package's bdd.config.ts (not the repo-root one
  // which is scoped to the tutorial).
  plugins: [bdd({ cwd: new URL('.', import.meta.url).pathname })],
  // Vite follows symlinks by default. Setting preserveSymlinks keeps the
  // resolved path as `library.feature.bdd.md` so the bdd plugin sees the
  // intended extension instead of vite trying to parse `library.feature`
  // as JavaScript.
  resolve: { preserveSymlinks: true },
  test: {
    include: ['**/*.bdd.md'],
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
