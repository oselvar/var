import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// Editor surface — references the mode-aware --ed-* tokens so it follows the
// site's light/dark theme automatically.
const varEditorTheme = EditorView.theme({
  '&': { background: 'var(--ed-bg)', color: 'var(--ed-text)' },
  '.cm-content': { caretColor: 'var(--ed-text)' },
  '.cm-gutters': {
    background: 'var(--ed-bg)',
    color: 'var(--ed-gutter)',
    border: 'none',
  },
  '.cm-activeLine': { background: 'transparent' },
  '.cm-activeLineGutter': { background: 'transparent' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ed-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { background: 'var(--ed-selection)' },
})

// Earthy syntax colors via --syn-* tokens. Registered WITHOUT fallback, so it
// overrides basicSetup's defaultHighlightStyle (which is fallback:true).
const varHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: 'var(--syn-comment)',
    fontStyle: 'italic',
  },
  {
    tag: [t.function(t.variableName), t.definition(t.variableName)],
    color: 'var(--syn-function)',
  },
  { tag: [t.number, t.bool, t.atom], color: 'var(--syn-number)' },
  { tag: t.heading, color: 'var(--syn-heading)', fontWeight: 'bold' },
  { tag: [t.meta, t.punctuation, t.bracket], color: 'var(--syn-meta)' },
])

export function varEditorThemeExt(): Extension {
  return [varEditorTheme, syntaxHighlighting(varHighlightStyle)]
}
