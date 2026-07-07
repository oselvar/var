import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const BIN_TS = resolve(HERE, '..', 'src', 'bin.ts')

// The temp project lives INSIDE the workspace (under tests/fixtures) so its
// steps file can `import { steps } from '@oselvar/var'` — Node resolves
// that up the tree to the workspace's node_modules. A temp dir in the OS tmp
// root could not.
let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(HERE, 'fixtures', 'drift-tmp-'))
  writeFileSync(
    join(dir, 'var.config.json'),
    JSON.stringify({
      docs: { include: ['*.md'], exclude: [] },
      steps: ['*.steps.ts'],
    }),
  )
  // A step that matches "I open the vault" but NOT "The vault is sealed".
  writeFileSync(
    join(dir, 'vault.steps.ts'),
    "import { steps } from '@oselvar/var'\n" +
      'const { stimulus } = steps(() => ({}))\n' +
      "stimulus('I open the vault', () => ({}))\n",
  )
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function run(args: ReadonlyArray<string>) {
  return spawnSync(process.execPath, [BIN_TS, ...args], { cwd: dir, encoding: 'utf8' })
}

function writeBaseline(examples: ReadonlyArray<{ name: string; line: number }>) {
  const lock = { version: 1, specs: { 'vault.md': { sourceHash: 'fnv1a:00000000', examples } } }
  writeFileSync(join(dir, 'var.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
}

function lock(): { specs: Record<string, { examples: { name: string; line: number }[] }> } {
  return JSON.parse(readFileSync(join(dir, 'var.lock.json'), 'utf8'))
}

test('a first run records the baseline and exits 0', () => {
  writeFileSync(join(dir, 'vault.md'), 'I open the vault.\n')
  const r = run(['run'])
  expect(r.status).toBe(0)
  expect(lock().specs['vault.md']?.examples).toEqual([{ name: 'I open the vault', line: 1 }])
})

test('a paragraph that stopped matching drifts: exits 1, baseline preserved', () => {
  // The baseline says this paragraph was an example; now it matches no step.
  writeFileSync(join(dir, 'vault.md'), 'The vault is sealed.\n')
  writeBaseline([{ name: 'The vault is sealed', line: 1 }])
  const before = readFileSync(join(dir, 'var.lock.json'), 'utf8')
  const r = run(['run'])
  expect(r.status).toBe(1)
  expect(r.stderr).toContain('drift')
  expect(r.stderr).toContain('The vault is sealed')
  // Unacknowledged drift leaves the baseline untouched (stays red).
  expect(readFileSync(join(dir, 'var.lock.json'), 'utf8')).toBe(before)
})

test('--update accepts the drift and re-records the baseline', () => {
  writeFileSync(join(dir, 'vault.md'), 'The vault is sealed.\n')
  writeBaseline([{ name: 'The vault is sealed', line: 1 }])
  const r = run(['run', '--update'])
  expect(r.status).toBe(0)
  // The now-prose paragraph is gone from the baseline.
  expect(lock().specs['vault.md']?.examples).toEqual([])
})

test('VAR_UPDATE=1 also accepts drift', () => {
  writeFileSync(join(dir, 'vault.md'), 'The vault is sealed.\n')
  writeBaseline([{ name: 'The vault is sealed', line: 1 }])
  const r = spawnSync(process.execPath, [BIN_TS, 'run'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, VAR_UPDATE: '1' },
  })
  expect(r.status).toBe(0)
  expect(lock().specs['vault.md']?.examples).toEqual([])
})
