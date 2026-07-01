import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { type Extension, Prec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// Editor surface — references the mode-aware --ed-* tokens so it follows the
// site's light/dark theme automatically.
const varEditorTheme = EditorView.theme({
  '&': { background: 'var(--ed-bg)', color: 'var(--ed-text)' },
  '.cm-gutters': {
    background: 'var(--ed-bg)',
    color: 'var(--ed-gutter)',
    border: 'none',
  },
  '.cm-activeLine': { background: 'transparent' },
  '.cm-activeLineGutter': { background: 'transparent' },
  '.cm-dropCursor': { borderLeftColor: 'var(--ed-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    background: 'var(--ed-selection)',
  },
})

// Per-token caret. basicSetup's drawSelection draws a single-colour caret and
// hides the native one (Prec.highest + caret-color: transparent !important).
// We hide that drawn caret and re-enable the native caret, whose `caret-color`
// is naturally inherited from the token span it sits in — so the caret matches
// the text colour of whatever it's over: --ed-text on normal text,
// --ed-step-text on the teal step band, --ed-chip-text on the brown param chip
// (each resolves to that token's own text colour in both light and dark).
// Prec.highest + !important is needed to beat drawSelection's own hiding rule.
// The doubled class selectors (`.cm-line.cm-line`) out-specify drawSelection's
// own `.cm-line { caret-color: transparent !important }` — a tie on !important
// and precedence is broken by specificity, so the native caret reappears on
// normal text instead of only inside the token spans.
const varCaretTheme = Prec.highest(
  EditorView.theme({
    '.cm-cursorLayer': { display: 'none' },
    '.cm-line.cm-line': { caretColor: 'var(--ed-text) !important' },
    '.cm-content.cm-content': { caretColor: 'var(--ed-text) !important' },
    '.cm-token-function.cm-token-function': { caretColor: 'var(--ed-step-text) !important' },
    '.cm-token-parameter.cm-token-parameter': { caretColor: 'var(--ed-chip-text) !important' },
  }),
)

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
  return [varEditorTheme, varCaretTheme, syntaxHighlighting(varHighlightStyle)]
}
