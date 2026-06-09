import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runLint } from '../src/lint.js'

test('reports missing-step diagnostic for a keyword-led unmatched sentence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-'))
  try {
    writeFileSync(join(dir, 'a.bdd.md'), '# A\n\nGiven I have 5 cukes')
    const captured: string[] = []
    const result = await runLint({
      cwd: dir,
      json: true,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    expect(result.exitCode).toBe(1)
    const parsed = JSON.parse(captured.join(''))
    expect(Array.isArray(parsed.diagnostics)).toBe(true)
    expect(parsed.diagnostics[0].code).toBe('missing-step')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('exit code 0 when no diagnostics found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-clean-'))
  try {
    writeFileSync(
      join(dir, 'docs.bdd.md'),
      '# Just docs\n\nSome prose with no keyword-led sentences.',
    )
    const result = await runLint({
      cwd: dir,
      json: true,
      globs: undefined,
      writeStdout: () => {},
      writeStderr: () => {},
    })
    expect(result.exitCode).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('human-readable output (no --json) lists path:line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-text-'))
  try {
    writeFileSync(join(dir, 'a.bdd.md'), '# A\n\nGiven I have 5 cukes')
    const captured: string[] = []
    await runLint({
      cwd: dir,
      json: false,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    const out = captured.join('')
    expect(out).toContain('a.bdd.md')
    expect(out).toContain('missing-step')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
