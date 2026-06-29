import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadVarConfig } from '../src/config.js'

test('loads var.config.ts when present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-'))
  try {
    writeFileSync(
      join(dir, 'var.config.ts'),
      `export default { vars: ['specs/**/*.md'], steps: ['**/*.steps.ts'] }\n`,
    )
    const cfg = await loadVarConfig(dir)
    // A plain array is shorthand for include-only.
    expect(cfg.vars).toEqual({ include: ['specs/**/*.md'], exclude: [] })
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads explicit vars.include/vars.exclude from var.config.ts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-explicit-'))
  try {
    writeFileSync(
      join(dir, 'var.config.ts'),
      `export default { vars: { include: ['specs/**/*.md'], exclude: ['specs/wip.md'] } }\n`,
    )
    const cfg = await loadVarConfig(dir)
    expect(cfg.vars).toEqual({ include: ['specs/**/*.md'], exclude: ['specs/wip.md'] })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('defaults vars to empty include/exclude (explicit vars required) when var.config.ts is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-empty-'))
  try {
    const cfg = await loadVarConfig(dir)
    expect(cfg.vars).toEqual({ include: [], exclude: [] })
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('defaults vars to empty include/exclude when var.config.ts omits vars', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-novars-'))
  try {
    writeFileSync(join(dir, 'var.config.ts'), `export default { steps: ['**/*.steps.ts'] }\n`)
    const cfg = await loadVarConfig(dir)
    expect(cfg.vars).toEqual({ include: [], exclude: [] })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads snippet.template from var.config.ts when provided', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-snippet-'))
  try {
    writeFileSync(
      join(dir, 'var.config.ts'),
      `export default {
        vars: ['specs/**/*.md'],
        steps: ['**/*.steps.ts'],
        snippet: { template: 'CUSTOM: {{expression}}' },
      }\n`,
    )
    const cfg = await loadVarConfig(dir)
    expect(cfg.snippet.template).toBe('CUSTOM: {{expression}}')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('defaults snippet.template to DEFAULT_SNIPPET_TEMPLATE when absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-snippet-default-'))
  try {
    const cfg = await loadVarConfig(dir)
    expect(cfg.snippet.template).toContain("{{role}}('{{expression}}'")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
