import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Inline workspace packages so vite transforms them from source.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
