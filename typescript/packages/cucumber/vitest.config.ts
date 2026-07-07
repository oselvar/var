import varPlugin from '@oselvar/var-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Point the plugin at THIS package's var.config.json (not the repo-root one
  // which is scoped to the tutorial).
  plugins: [varPlugin({ cwd: new URL('.', import.meta.url).pathname })],
  // Force a single `@oselvar/var` instance so the steps registered via
  // `steps` (author side) and the registry glue (`@oselvar/var/registry`)
  // share one module — otherwise the registry splits and no steps are seen.
  resolve: { dedupe: ['@oselvar/var'] },
  test: {
    include: ['**/*.feature'],
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
