import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runInit } from '../src/init.ts'

test('scaffolds var.config.json and an example .md + steps file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-'))
  try {
    const result = await runInit({ cwd: dir, writeStdout: () => {} })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, 'var.config.json'))).toBe(true)
    expect(existsSync(join(dir, 'var-examples/01-hello.md'))).toBe(true)
    expect(existsSync(join(dir, 'var-examples/steps/01-hello.steps.ts'))).toBe(true)
    const stepsTs = readFileSync(join(dir, 'var-examples/steps/01-hello.steps.ts'), 'utf8')
    expect(stepsTs).toContain('steps')
    expect(stepsTs).toContain('({ greeting:')
    expect(stepsTs).not.toContain('ctx.greeting =')
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
