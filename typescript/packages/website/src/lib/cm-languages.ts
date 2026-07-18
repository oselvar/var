// The CodeMirror highlighter for each site language's code tabs. Kept as a
// `Record<SiteLang, …>` so adding a port to `languages.json` (and the `SiteLang`
// union) without wiring highlighting here is a *type* error — and
// `tests/cm-languages.test.ts` turns the same omission into a failing CI test
// (which, unlike `astro build`, actually type-checks nothing but does run this
// map). Factored out of `editor-mount.ts` so the assertion can import it in a
// plain Node test without pulling in the browser-only editor bootstrap.
//
// Each entry is a thunk: CodeMirror language extensions are cheap to build but
// stateful, so every editor instance gets its own.
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { StreamLanguage } from '@codemirror/language'
import { kotlin } from '@codemirror/legacy-modes/mode/clike'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import type { Extension } from '@codemirror/state'
import type { SiteLang } from './site-lang.ts'

export const CM_LANGUAGE: Readonly<Record<SiteLang, () => Extension>> = {
  ts: () => javascript({ typescript: true }),
  java: () => java(),
  kotlin: () => StreamLanguage.define(kotlin),
  python: () => python(),
  ruby: () => StreamLanguage.define(ruby),
  rust: () => rust(),
}

// The language-neutral `.md` spec (`langOfPath` → `undefined`) highlights as
// Markdown.
export const markdownHighlight = (): Extension => markdown()
