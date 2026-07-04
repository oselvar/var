import { defineConfig } from 'vitest/config'
import { VarResultsReporter } from './packages/var-vitest/src/reporter.js'

// The reporter's cwd is the REPO root (not typescript/): var.config.json lives
// there, and spec paths in .var/ results must stay relative to it (no `..`
// segments) now that the spec corpus is doc/examples/ at the repo root.
const repoRoot = new URL('..', import.meta.url).pathname

// Vitest 4 replaced `vitest.workspace.ts` + `defineWorkspace` with `test.projects`.
// Reporters are root-level in vitest 4 workspace mode — project reporters are ignored.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'examples/vitest.config.ts'],
    reporters: ['default', new VarResultsReporter({ cwd: repoRoot })],
    // Coverage is root-level in vitest 4 workspace mode, like reporters.
    // Opt-in via `pnpm test:coverage`; reports land in coverage/ (text
    // summary + HTML + lcov for editor/CI integrations).
    coverage: {
      provider: 'v8',
      // The website is an app, not a published package, and is outside the
      // test gate (see CLAUDE.md) — keep its sources out of the report.
      include: ['packages/*/src/**'],
      exclude: ['packages/website/**'],
      reporter: ['text', 'html', 'lcov'],
      // Ratchet: ~2 points under the levels measured when thresholds were
      // introduced (2026-07-03: statements 80.3, branches 71.5, functions
      // 82.9, lines 83.0). Raise as coverage grows; never lower.
      thresholds: {
        statements: 78,
        branches: 69,
        functions: 80,
        lines: 81,
      },
    },
  },
})
