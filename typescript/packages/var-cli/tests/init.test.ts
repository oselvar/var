import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import languages from '../../../../languages.json' with { type: 'json' }
import { runInit } from '../src/init.ts'

test('scaffolds var.config.json and an example .md + steps file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-'))
  try {
    const result = await runInit({ cwd: dir, writeStdout: () => {} })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, 'var.config.json'))).toBe(true)
    expect(existsSync(join(dir, 'var-examples/deep-thought.md'))).toBe(true)
    expect(existsSync(join(dir, 'var-examples/steps/deep-thought.steps.ts'))).toBe(true)
    const exampleMd = readFileSync(join(dir, 'var-examples/deep-thought.md'), 'utf8')
    // The scaffolded spec is plain prose — no Given/When/Then keyword ceremony.
    expect(exampleMd).not.toMatch(/^\s*(Given|When|Then)\b/m)
    const stepsTs = readFileSync(join(dir, 'var-examples/steps/deep-thought.steps.ts'), 'utf8')
    expect(stepsTs).toContain('steps')
    expect(stepsTs).toContain('sensor(')
    expect(stepsTs).toContain('=> 42')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the scaffolded config uses the steps glob declared for TypeScript in languages.json', async () => {
  // Guards against the CLI's init template drifting from the shared language
  // manifest (the single source of truth every port scaffolds from).
  const ts = languages.find((l) => l.id === 'ts')
  expect(ts).toBeDefined()
  const dir = mkdtempSync(join(tmpdir(), 'var-init-manifest-'))
  try {
    await runInit({ cwd: dir, writeStdout: () => {} })
    const config = JSON.parse(readFileSync(join(dir, 'var.config.json'), 'utf8'))
    expect(config.steps).toContain(ts?.stepsGlob)
    expect(ts?.stepsGlob.endsWith(ts.ext)).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses to overwrite an existing var.config.json; reports which files were skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-conflict-'))
  try {
    writeFileSync(join(dir, 'var.config.json'), '{ "docs": { "include": [] } }')
    const captured: string[] = []
    const result = await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(dir, 'var.config.json'), 'utf8')).toBe('{ "docs": { "include": [] } }')
    expect(captured.join('')).toContain('skipped')
    expect(captured.join('')).toContain('var.config.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
