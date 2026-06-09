import { describe, expect, test } from 'vitest'
import { bddVitestPlugin, generateVirtualModule } from '../src/plugin.js'

describe('generateVirtualModule', () => {
  test('produces TS that imports runtime, step files, and invokes runBddSource', () => {
    const out = generateVirtualModule({
      bddPath: '/abs/foo.bdd.md',
      stepImports: ['/abs/account.steps.ts'],
    })
    expect(out).toContain("import { test as vitestTest } from 'vitest'")
    expect(out).toContain("import { runBddSource } from '@oselvar/bdd-vitest/runtime'")
    expect(out).toContain("import '/abs/account.steps.ts'")
    expect(out).toContain("runBddSource(SOURCE, '/abs/foo.bdd.md',")
  })
})

describe('bddVitestPlugin', () => {
  test('returns a vite plugin object with name and resolveId/load hooks', () => {
    const plugin = bddVitestPlugin()
    expect(plugin.name).toBe('@oselvar/bdd-vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
