import { describe, expect, it } from 'vitest'
import { createTsDiagnostics } from './ts-diagnostics.js'

describe('ts-diagnostics', () => {
  it('reports a type mismatch', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc('a.steps.ts', 'const n: number = "x"\n')
    const d = ts.diagnostics('a.steps.ts')
    expect(d.length).toBeGreaterThan(0)
    expect(d.some((x) => /not assignable/.test(x.message))).toBe(true)
  })

  it('resolves @oselvar/var-runtime via the ambient decl (no cannot-find-module)', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc(
      'b.steps.ts',
      `import { defineState } from '@oselvar/var-runtime'\nconst { action } = defineState(() => ({ greeting: '' }))\naction('I greet {string}', (ctx, name) => { ctx.greeting = name })\n`,
    )
    const d = ts.diagnostics('b.steps.ts')
    expect(d.find((x) => /Cannot find module/.test(x.message))).toBeUndefined()
  })

  it('infers built-in parameter types from the cucumber expression', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc(
      'd.steps.ts',
      `import { defineState } from '@oselvar/var-runtime'\n` +
        `const { action } = defineState(() => ({ n: 0 }))\n` +
        // `count` carries NO annotation; {int} infers it as number, so assigning
        // it to a string must produce a diagnostic.
        `action('I have {int} cukes', (_ctx, count) => { const s: string = count; void s })\n`,
    )
    const d = ts.diagnostics('d.steps.ts')
    expect(d.some((x) => /not assignable/.test(x.message))).toBe(true)
  })

  it('infers custom parameter types declared in defineState', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc(
      'e.steps.ts',
      `import { defineState } from '@oselvar/var-runtime'\n` +
        `const { action } = defineState(() => ({}), {\n` +
        `  date: { regexp: /.+/, transformer: (s: string) => new Date(s) },\n` +
        `})\n` +
        // `when` has NO annotation; {date}'s transformer returns Date, so calling
        // a string method on it must produce a diagnostic.
        `action('due on {date}', (_ctx, when) => { when.toUpperCase() })\n`,
    )
    const d = ts.diagnostics('e.steps.ts')
    expect(d.some((x) => /toUpperCase/.test(x.message))).toBe(true)
  })

  it('has the standard lib bundled (Error resolves)', () => {
    const ts = createTsDiagnostics()
    ts.updateDoc('c.steps.ts', 'throw new Error("boom")\n')
    const d = ts.diagnostics('c.steps.ts')
    expect(d.find((x) => /Cannot find name 'Error'/.test(x.message))).toBeUndefined()
  })
})
