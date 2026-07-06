import { defineConfig } from 'vitest/config'

// Only the website's pure logic (src/lib) is tested here — pages and
// components are exercised by the deploy build, not this gate. Runs under
// the root vitest workspace like every other package.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
