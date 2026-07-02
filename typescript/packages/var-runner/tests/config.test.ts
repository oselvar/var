import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { findSpecs, readVarConfig } from '../src/config.js'

test('readVarConfig loads var.config.json when present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-runner-cfg-'))
  try {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["specs/**/*.md"], "exclude": [] }, "steps": ["**/*.steps.ts"] }\n',
    )
    const cfg = await readVarConfig(dir)
    expect(cfg.docs).toEqual({ include: ['specs/**/*.md'], exclude: [] })
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readVarConfig returns an empty config when var.config.json is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-runner-cfg-empty-'))
  try {
    const cfg = await readVarConfig(dir)
    expect(cfg.docs).toEqual({ include: [], exclude: [] })
    expect(cfg.steps).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findSpecs resolves include globs to absolute paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-runner-find-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# Spec A\n')
    writeFileSync(join(dir, 'b.md'), '# Spec B\n')
    const files = findSpecs(dir, ['*.md'])
    expect(files).toHaveLength(2)
    expect(files.every((f) => f.startsWith(dir))).toBe(true)
    expect(files.map((f) => f.split('/').at(-1)).sort()).toEqual(['a.md', 'b.md'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findSpecs respects exclude globs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-runner-find-excl-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# Spec A\n')
    writeFileSync(join(dir, 'wip.md'), '# WIP\n')
    const files = findSpecs(dir, ['*.md'], ['wip.md'])
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/a\.md$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
