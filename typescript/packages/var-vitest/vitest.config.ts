import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Vite by default treats workspace packages as node_modules and skips its
    // TS transform. Inline them so cross-package imports (e.g. `@oselvar/var`)
    // resolve `./foo.js` → `./foo.ts` via vite's resolver, no build required.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
