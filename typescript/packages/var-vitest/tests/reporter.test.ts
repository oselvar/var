import { join } from 'node:path'
import { hashSource } from '@oselvar/var-core'
import { describe, expect, test } from 'vitest'
import {
  buildSpecResults,
  collectFromModules,
  resultFilePath,
  toSpecPath,
} from '../src/reporter.js'

const passed = { name: 'A', status: 'passed' as const, lines: [3] }
const failed = {
  name: 'B',
  status: 'failed' as const,
  lines: [5],
  failure: { line: 5, message: 'm', stack: 's', cells: [{ from: 1, to: 2, actual: '4' }] },
}

describe('buildSpecResults', () => {
  test('wraps examples with version, path, and source hash', () => {
    const r = buildSpecResults('docs/a.md', 'src', [passed, failed])
    expect(r).toEqual({
      version: 1,
      specPath: 'docs/a.md',
      sourceHash: hashSource('src'),
      examples: [passed, failed],
    })
  })
})

describe('collectFromModules', () => {
  test('groups examples by moduleId via meta(), skips meta-less tests and empty modules', () => {
    const modules = [
      {
        moduleId: '/cwd/docs/a.md',
        children: {
          allTests: () => [
            { meta: () => ({ varResult: passed }) },
            { meta: () => ({ varResult: failed }) },
            { meta: () => ({}) }, // var:diagnostic-style test, no varResult
          ],
        },
      },
      {
        moduleId: '/cwd/docs/empty.md',
        children: { allTests: () => [{ meta: () => ({}) }] },
      },
    ]
    const byFile = collectFromModules(modules)
    expect([...byFile.keys()]).toEqual(['/cwd/docs/a.md'])
    expect(byFile.get('/cwd/docs/a.md')).toEqual([passed, failed])
  })
})

describe('path helpers', () => {
  test('toSpecPath returns a POSIX path relative to cwd', () => {
    const abs = join('/cwd', 'docs', 'a.md')
    expect(toSpecPath(abs, '/cwd')).toBe('docs/a.md')
  })
  test('resultFilePath mirrors the spec path under .var/', () => {
    expect(resultFilePath('docs/a.md', '/cwd')).toBe(join('/cwd', '.var', 'docs/a.md.json'))
  })
})
