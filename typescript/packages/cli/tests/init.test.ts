import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import languages from '../../../../languages.json' with { type: 'json' }
import { runInit } from '../src/init.ts'

test('scaffolds varar.config.json and an example .md + steps file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-'))
  try {
    const result = await runInit({ cwd: dir, writeStdout: () => {} })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, 'varar.config.json'))).toBe(true)
    expect(existsSync(join(dir, 'varar-examples/deep-thought.md'))).toBe(true)
    expect(existsSync(join(dir, 'varar-examples/steps/deep-thought.steps.ts'))).toBe(true)
    const exampleMd = readFileSync(join(dir, 'varar-examples/deep-thought.md'), 'utf8')
    // The scaffolded spec is plain prose — no Given/When/Then keyword ceremony.
    expect(exampleMd).not.toMatch(/^\s*(Given|When|Then)\b/m)
    const stepsTs = readFileSync(join(dir, 'varar-examples/steps/deep-thought.steps.ts'), 'utf8')
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
    const config = JSON.parse(readFileSync(join(dir, 'varar.config.json'), 'utf8'))
    expect(config.steps).toContain(ts?.stepsGlob)
    expect(ts?.stepsGlob.endsWith(ts.ext)).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses to overwrite an existing varar.config.json; reports which files were skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-conflict-'))
  try {
    writeFileSync(join(dir, 'varar.config.json'), '{ "docs": { "include": [] } }')
    const captured: string[] = []
    const result = await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(dir, 'varar.config.json'), 'utf8')).toBe(
      '{ "docs": { "include": [] } }',
    )
    expect(captured.join('')).toContain('skipped')
    expect(captured.join('')).toContain('varar.config.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('creates a package.json with "type": "module" when the project has none', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-nopkg-'))
  try {
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.type).toBe('module')
    expect(captured.join('')).toContain('created package.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('adds "type": "module" to a package.json that declares no type, keeping its other fields', async () => {
  // The `npm init -y` case: the scaffolded .steps.ts is an ES module, so
  // without this `varar run` fails with "Cannot use import statement outside a
  // module".
  const dir = mkdtempSync(join(tmpdir(), 'var-init-addtype-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{ "name": "demo", "version": "1.0.0" }')
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg).toEqual({ name: 'demo', version: '1.0.0', type: 'module' })
    expect(captured.join('')).toContain('updated package.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('never rewrites a type the project already chose, and warns when it is not module', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-init-cjs-'))
  try {
    const original = '{ "name": "demo", "type": "commonjs" }'
    writeFileSync(join(dir, 'package.json'), original)
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(original)
    expect(captured.join('')).toContain('warning')
    expect(captured.join('')).toContain('"commonjs"')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
