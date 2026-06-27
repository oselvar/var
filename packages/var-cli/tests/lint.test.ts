import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runLint } from '../src/lint.js'

test('exit code 0 when no diagnostics found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-lint-clean-'))
  try {
    writeFileSync(
      join(dir, 'docs.var.md'),
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
test('a standalone table or fenced code block is not a lint error', async () => {
  // Tables and fenced code blocks that do not attach to a step are valid
  // Markdown content, not mistakes — `var lint` stays quiet about them.
  const dir = mkdtempSync(join(tmpdir(), 'var-lint-text-'))
  try {
    writeFileSync(
      join(dir, 'a.var.md'),
      '# A\n\n```js\nx=1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
    )
    const captured: string[] = []
    const result = await runLint({
      cwd: dir,
      json: false,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    expect(captured.join('')).toBe('')
    expect(result.exitCode).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
