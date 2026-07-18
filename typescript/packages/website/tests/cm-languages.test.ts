import { expect, test } from 'vitest'
import { CM_LANGUAGE } from '../src/lib/cm-languages.ts'
import { SITE_LANGS } from '../src/lib/site-lang.ts'

// The gate that makes forgetting CodeMirror highlighting for a new port a build
// error: every language in languages.json (→ SITE_LANGS) must have a highlighter
// wired in CM_LANGUAGE, and each must construct without throwing. Adding a port
// without touching cm-languages.ts turns this red in `pnpm check` (the CI test
// job + `make typescript`) — the website's own build does not type-check, so
// this test, not tsc, is what enforces it.
test('every site language has a working CodeMirror highlighter', () => {
  for (const lang of SITE_LANGS) {
    const factory = CM_LANGUAGE[lang]
    expect(factory, `no CodeMirror highlighting wired for "${lang}" in cm-languages.ts`).toBeTypeOf(
      'function',
    )
    expect(factory(), `CodeMirror highlighter for "${lang}" produced no extension`).toBeDefined()
  }
})

test('CM_LANGUAGE has no stray entries beyond the site languages', () => {
  expect(Object.keys(CM_LANGUAGE).sort()).toEqual([...SITE_LANGS].sort())
})
