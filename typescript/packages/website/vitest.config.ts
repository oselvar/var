import { defineConfig } from 'vitest/config'
import { stripTypescriptSourcemap } from '../../vitest.plugins.js'

export default defineConfig({
  plugins: [stripTypescriptSourcemap()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
