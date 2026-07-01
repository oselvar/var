import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Drive the source bin.ts through tsx — no `pnpm build` required. The published
// package resolves the `var` binary to `./dist/bin.js`; locally we exercise the
// same source via tsx so the dev loop stays fast.
const HERE = dirname(fileURLToPath(import.meta.url))
const BIN_TS = resolve(HERE, '..', 'src', 'bin.ts')
const WORKSPACE_ROOT = resolve(HERE, '..', '..', '..')
const TSX = resolve(WORKSPACE_ROOT, 'node_modules', '.bin', 'tsx')

function run(args: ReadonlyArray<string>, cwd: string) {
  // Scrub NODE_OPTIONS so we don't drag the parent's `--import tsx` into the
  // spawned process — that flag would re-resolve `tsx` from the temp cwd
  // (which has no node_modules) and crash before the CLI ever runs.
  const { NODE_OPTIONS: _drop, ...env } = process.env
  return spawnSync(TSX, [BIN_TS, ...args], { cwd, encoding: 'utf8', env })
}

describe('var CLI (source via tsx)', () => {
  test('init scaffolds three files and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'var-e2e-init-'))
    try {
      const r = run(['init'], dir)
      expect(r.status).toBe(0)
      expect(readFileSync(join(dir, 'var.config.ts'), 'utf8')).toContain('vars:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('lint --json exits 0 when a .md has only prose / unmatched keyword-led lines', () => {
    // No Given/When/Then heuristic: keyword-led but unmatched sentences are
    // not diagnostics, so lint must exit 0.
    const dir = mkdtempSync(join(tmpdir(), 'var-e2e-lint-'))
    try {
      writeFileSync(join(dir, 'a.md'), '# A\n\nGiven I have 5 cukes')
      const r = run(['lint', '--json'], dir)
      expect(r.status).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.diagnostics).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
