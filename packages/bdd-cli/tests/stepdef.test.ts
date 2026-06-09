import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runStepdef } from '../src/stepdef.js'

test('writes the snippet to the file specified by --file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-'))
  try {
    const target = join(dir, 'steps.ts')
    writeFileSync(target, '')
    const result = await runStepdef({
      text: 'I have 5 cukes',
      file: target,
      print: false,
      cwd: dir,
      writeStdout: () => {},
    })
    expect(result.exitCode).toBe(0)
    const written = readFileSync(target, 'utf8')
    expect(written).toContain("step('I have {int} cukes', (ctx, count: number) => {")
    expect(written).toContain("throw new Error('not implemented')")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--print writes to stdout, not the file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-print-'))
  try {
    const captured: string[] = []
    const result = await runStepdef({
      text: 'I have 5 cukes',
      file: undefined,
      print: true,
      cwd: dir,
      writeStdout: (s) => captured.push(s),
    })
    expect(result.exitCode).toBe(0)
    expect(captured.join('')).toContain("step('I have {int} cukes',")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('appends to an existing step file (does not overwrite)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-append-'))
  try {
    const target = join(dir, 'steps.ts')
    writeFileSync(target, "import { step } from '@oselvar/bdd-vitest'\n\n")
    await runStepdef({
      text: 'I have 5 cukes',
      file: target,
      print: false,
      cwd: dir,
      writeStdout: () => {},
    })
    const written = readFileSync(target, 'utf8')
    expect(written).toContain("import { step } from '@oselvar/bdd-vitest'")
    expect(written).toContain("step('I have {int} cukes',")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('honors snippet.template from bdd.config.ts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-custom-'))
  try {
    writeFileSync(
      join(dir, 'bdd.config.ts'),
      `export default { snippet: { template: 'CUSTOM:{{expression}}' } }\n`,
    )
    const target = join(dir, 'steps.ts')
    writeFileSync(target, '')
    await runStepdef({
      text: 'I have 5 cukes',
      file: target,
      print: false,
      cwd: dir,
      writeStdout: () => {},
    })
    expect(readFileSync(target, 'utf8')).toContain('CUSTOM:I have {int} cukes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
