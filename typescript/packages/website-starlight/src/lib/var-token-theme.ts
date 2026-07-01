import { EditorView } from '@codemirror/view'

// A matched step renders as one capsule: teal step bands (--ed-step-bg) and
// brown param chips (--ed-chip-bg) alternating — step, param, step, param… The
// function token is extended through the inter-token whitespace
// (joinStepParamTokens) so the spans are DOM-adjacent. We round only the two
// OUTERMOST corners of the whole run and square every internal seam, so the
// entire step reads as a single rounded rectangle rather than a string of
// individually-rounded pills.
//
// NOTE: the seam selectors below are written out as explicit comma-separated
// pairs rather than `:is(.cm-token-function, .cm-token-parameter)`. CodeMirror's
// style-mod splits theme selectors on every comma (`selector.split(/,\s*/)`),
// which would shred the comma INSIDE an `:is(...)` into invalid fragments. Only
// top-level commas (a genuine selector list) survive that split.
const TOKENS = ['.cm-token-function', '.cm-token-parameter']
// "left token of a seam": a capsule immediately followed by another capsule.
const seamLeft = TOKENS.flatMap((a) => TOKENS.map((b) => `${a}:has(+ ${b})`)).join(', ')
// "right token of a seam": a capsule immediately preceded by another capsule.
const seamRight = TOKENS.flatMap((a) => TOKENS.map((b) => `${a} + ${b}`)).join(', ')

export const varTokenTheme = EditorView.baseTheme({
  '.cm-token-function': {
    background: 'var(--ed-step-bg)',
    color: 'var(--ed-step-text)',
    borderRadius: '4px',
    padding: '1px 5px',
    // Bold lifts the light-on-teal text to the AA large/bold contrast bar and
    // matches the param chip.
    fontWeight: '600',
  },
  '.cm-token-parameter': {
    background: 'var(--ed-chip-bg)',
    color: 'var(--ed-chip-text)',
    borderRadius: '4px',
    padding: '1px 5px',
    fontWeight: '600',
  },
  // Seam: any capsule token immediately followed by another capsule token
  // squares its trailing corners and drops the gap, so adjacent bands/chips
  // read as one continuous highlight.
  [seamLeft]: {
    borderTopRightRadius: '0',
    borderBottomRightRadius: '0',
    paddingRight: '0',
  },
  [seamRight]: {
    borderTopLeftRadius: '0',
    borderBottomLeftRadius: '0',
  },
})
