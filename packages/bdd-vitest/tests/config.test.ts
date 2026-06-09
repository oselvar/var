import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadBddConfig } from '../src/config.js'

test('loads bdd.config.ts when present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-cfg-'))
  try {
    writeFileSync(
      join(dir, 'bdd.config.ts'),
      `export default { bdds: ['**/*.bdd.md'], steps: ['**/*.steps.ts'] }\n`,
    )
    const cfg = await loadBddConfig(dir)
    expect(cfg.bdds).toEqual(['**/*.bdd.md'])
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('returns defaults when bdd.config.ts is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-cfg-empty-'))
  try {
    const cfg = await loadBddConfig(dir)
    expect(cfg.bdds).toEqual(['**/*.bdd.md'])
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
