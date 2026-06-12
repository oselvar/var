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
    expect(out).toContain('import "/abs/account.steps.ts"')
    expect(out).toContain('runBddSource(SOURCE, "/abs/foo.bdd.md",')
    expect(out).toContain('scannerPlugins: bddConfig?.scannerPlugins ?? []')
  })

  test('imports bdd.config.ts when configPath is provided so scannerPlugins reach the runtime', () => {
    const out = generateVirtualModule({
      bddPath: '/abs/foo.bdd.md',
      stepImports: [],
      configPath: '/abs/bdd.config.ts',
    })
    expect(out).toContain('import bddConfig from "/abs/bdd.config.ts"')
  })

  test('falls back to an empty bddConfig when no bdd.config.ts is found', () => {
    const out = generateVirtualModule({
      bddPath: '/abs/foo.bdd.md',
      stepImports: [],
    })
    expect(out).toContain('const bddConfig = {}')
  })
})

describe('bddVitestPlugin', () => {
  test('returns a vite plugin object with name and resolveId/load hooks', () => {
    const plugin = bddVitestPlugin()
    expect(plugin.name).toBe('@oselvar/bdd-vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
