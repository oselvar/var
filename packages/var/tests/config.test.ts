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
      `export default { vars: ['**/*.var.md'], steps: ['**/*.steps.ts'] }\n`,
    )
    const cfg = await loadVarConfig(dir)
    expect(cfg.vars).toEqual(['**/*.var.md'])
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('returns defaults when var.config.ts is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-empty-'))
  try {
    const cfg = await loadVarConfig(dir)
    expect(cfg.vars).toEqual(['**/*.var.md'])
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
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
        vars: ['**/*.var.md'],
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
