import { describe, expect, test } from 'vitest'
import { generateVirtualModule, varVitestPlugin } from '../src/plugin.js'

describe('generateVirtualModule', () => {
  test('produces TS that imports runtime, step files, and invokes runVarSource', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.var.md',
      stepImports: ['/abs/account.steps.ts'],
    })
    expect(out).toContain("import { test as vitestTest } from 'vitest'")
    expect(out).toContain("import { runVarSource } from '@oselvar/var-vitest/runtime'")
    expect(out).toContain('import "/abs/account.steps.ts"')
    expect(out).toContain('runVarSource(SOURCE, "/abs/foo.var.md",')
    expect(out).toContain('scannerPlugins: varConfig?.scannerPlugins ?? []')
  })

  test('imports var.config.ts when configPath is provided so scannerPlugins reach the runtime', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.var.md',
      stepImports: [],
      configPath: '/abs/var.config.ts',
    })
    expect(out).toContain('import varConfig from "/abs/var.config.ts"')
  })

  test('falls back to an empty varConfig when no var.config.ts is found', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.var.md',
      stepImports: [],
    })
    expect(out).toContain('const varConfig = {}')
  })
})

describe('varVitestPlugin', () => {
  test('returns a vite plugin object with name and resolveId/load hooks', () => {
    const plugin = varVitestPlugin()
    expect(plugin.name).toBe('@oselvar/var-vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
