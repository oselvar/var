import varPlugin from '@oselvar/var-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Point the plugin at THIS package's var.config.ts (not the repo-root one
  // which is scoped to the tutorial).
  plugins: [varPlugin({ cwd: new URL('.', import.meta.url).pathname })],
  // Vite follows symlinks by default. Setting preserveSymlinks keeps the
  // resolved path as `library.feature.var.md` so the var plugin sees the
  // intended extension instead of vite trying to parse `library.feature`
  // as JavaScript.
  // `preserveSymlinks` (needed so the symlinked `library.feature.var.md` keeps
  // its extension) otherwise resolves the author's bare `@oselvar/var` import
  // (from this package's real path) to a different module instance than the one
  // `@oselvar/var/registry` re-exports from — splitting the single-module
  // registry so no steps are seen. `dedupe` forces one `@oselvar/var` instance.
  resolve: { preserveSymlinks: true, dedupe: ['@oselvar/var'] },
  test: {
    include: ['**/*.var.md'],
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
