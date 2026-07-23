import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadVarConfig, parseVarConfig } from '../src/config.ts'
import { findFiles } from '../src/find-files.ts'

test('parseVarConfig reads all keys', () => {
  const parsed = parseVarConfig(
    `{
      "docs": { "include": ["specs/**/*.md"], "exclude": ["specs/wip/**"] },
      "steps": ["**/*.steps.ts"],
      "snippets": { "typescript": "T" }
    }`,
    'varar.config.json',
  )
  expect(parsed).toEqual({
    docs: { include: ['specs/**/*.md'], exclude: ['specs/wip/**'] },
    steps: ['**/*.steps.ts'],
    snippets: { typescript: 'T' },
  })
})

test('all keys are optional and default to empty; $schema is ignored', () => {
  const parsed = parseVarConfig('{ "$schema": "https://x/y.json" }', 'varar.config.json')
  expect(parsed).toEqual({
    docs: { include: [], exclude: [] },
    steps: [],
    snippets: {},
  })
})

test('null values are treated as absent, not errors', () => {
  const parsed = parseVarConfig(
    '{ "docs": { "include": null, "exclude": null }, "steps": null, "snippets": null }',
    'varar.config.json',
  )
  expect(parsed).toEqual({
    docs: { include: [], exclude: [] },
    steps: [],
    snippets: {},
  })
})

test('malformed JSON throws with the source path in the message', () => {
  expect(() => parseVarConfig('{ nope', '/w/varar.config.json')).toThrowError(
    /^\/w\/varar\.config\.json/,
  )
})

test('an unknown top-level key throws (migration tripwire for the old "vars" key)', () => {
  expect(() => parseVarConfig('{ "vars": {} }', 'varar.config.json')).toThrowError(
    /unknown key.*"vars"/i,
  )
})

test('a wrong-typed value throws naming the key', () => {
  expect(() => parseVarConfig('{ "steps": "x" }', 'varar.config.json')).toThrowError(/steps/)
  expect(() => parseVarConfig('{ "docs": [] }', 'varar.config.json')).toThrowError(/docs/)
  expect(() =>
    parseVarConfig('{ "snippets": { "typescript": 1 } }', 'varar.config.json'),
  ).toThrowError(/snippets/)
})

test('loadVarConfig reads docs/steps/snippets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-'))
  try {
    writeFileSync(join(dir, 'varar.config.json'), '{ "docs": { "include": ["**/*.md"] } }\n')
    const cfg = await loadVarConfig(dir)
    expect(cfg.docs).toEqual({ include: ['**/*.md'], exclude: [] })
    expect(cfg.steps).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing varar.config.json yields the empty config (no default steps glob)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-none-'))
  try {
    const cfg = await loadVarConfig(dir)
    expect(cfg.docs).toEqual({ include: [], exclude: [] })
    expect(cfg.steps).toEqual([])
    expect(cfg.snippets).toEqual({})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findFiles resolves include globs to absolute paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-config-find-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# Spec A\n')
    writeFileSync(join(dir, 'b.md'), '# Spec B\n')
    const files = findFiles(dir, ['*.md'])
    expect(files).toHaveLength(2)
    expect(files.every((f) => f.startsWith(dir))).toBe(true)
    expect(files.map((f) => f.split('/').at(-1)).sort()).toEqual(['a.md', 'b.md'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findFiles respects exclude globs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-config-find-excl-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# Spec A\n')
    writeFileSync(join(dir, 'wip.md'), '# WIP\n')
    const files = findFiles(dir, ['*.md'], ['wip.md'])
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/a\.md$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
