import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  type Panel,
  gutter,
  showPanel,
} from '@codemirror/view'
import type { RunResults } from './run-types.ts'

// Effect carrying the latest run results (null clears them).
export const setRunResults = StateEffect.define<RunResults | null>()

const resultsField = StateField.define<RunResults | null>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged) return null // results go stale on edit
    for (const e of tr.effects) if (e.is(setRunResults)) return e.value
    return value
  },
})

// Line-background decorations derived from the results.
const decoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const results = tr.state.field(resultsField)
    if (!tr.docChanged && !tr.effects.some((e) => e.is(setRunResults))) return deco.map(tr.changes)
    if (!results) return Decoration.none
    const builder = new RangeSetBuilder<Decoration>()
    const cls = (s: 'passed' | 'failed') => (s === 'passed' ? 'cm-run-pass' : 'cm-run-fail')
    const lines = results.examples
      .flatMap((ex) => ex.lines.map((ln) => ({ ln, status: ex.status })))
      .sort((a, b) => a.ln - b.ln)
    for (const { ln, status } of lines) {
      if (ln >= 1 && ln <= tr.state.doc.lines) {
        builder.add(tr.state.doc.line(ln).from, tr.state.doc.line(ln).from, Decoration.line({ class: cls(status) }))
      }
    }
    return builder.finish()
  },
  provide: (f) => EditorView.decorations.from(f),
})

class ErrorMarker extends GutterMarker {
  constructor(readonly stack: string) {
    super()
  }
  eq(other: GutterMarker): boolean {
    return other instanceof ErrorMarker && other.stack === this.stack
  }
  // toDOM takes (view: EditorView) per the installed CM types
  toDOM(_view: EditorView): Node {
    const el = document.createElement('span')
    el.textContent = '✗'
    el.className = 'cm-run-errmark'
    el.title = 'Click to show the stack trace'
    el.onclick = () => {
      // Simple popover: a <pre> appended near the editor. (A CM tooltip is an
      // alternative — see note below.)
      const pop = document.createElement('pre')
      pop.className = 'cm-run-stack'
      pop.textContent = this.stack
      pop.onclick = () => pop.remove()
      el.closest('.cm-editor')?.appendChild(pop)
    }
    return el
  }
}

const errorGutter = gutter({
  class: 'cm-run-gutter',
  lineMarker(view, line) {
    const results = view.state.field(resultsField)
    if (!results) return null
    const lineNo = view.state.doc.lineAt(line.from).number
    for (const ex of results.examples) {
      if (ex.failure && ex.failure.line === lineNo) return new ErrorMarker(ex.failure.stack)
    }
    return null
  },
})

function runPanel(view: EditorView, onRunAll: (view: EditorView) => void): Panel {
  const dom = document.createElement('div')
  dom.className = 'cm-run-bar'
  const btn = document.createElement('button')
  btn.textContent = '▶ Run all'
  btn.onclick = () => onRunAll(view)
  dom.appendChild(btn)
  return { dom, top: true }
}

const runTheme = EditorView.baseTheme({
  '.cm-run-bar': { padding: '4px 8px', borderBottom: '2px solid var(--ink)', background: 'var(--yellow)' },
  '.cm-run-bar button': { font: 'inherit', cursor: 'pointer' },
  '.cm-run-pass': { background: 'rgba(40, 167, 69, 0.18)' },
  '.cm-run-fail': { background: 'rgba(255, 46, 136, 0.18)' },
  '.cm-run-errmark': { color: 'var(--accent)', cursor: 'pointer', fontWeight: '700' },
  '.cm-run-stack': {
    position: 'absolute', right: '8px', bottom: '8px', maxWidth: '90%', maxHeight: '40%',
    overflow: 'auto', background: 'var(--ink)', color: 'var(--cream)', padding: '8px',
    borderRadius: '6px', fontSize: '12px', zIndex: '5', whiteSpace: 'pre-wrap',
  },
})

// `onRunAll` is injected so Task 3 can swap the stub for the real runner.
export function varRunExtension(onRunAll: (view: EditorView) => void): Extension {
  return [
    resultsField,
    decoField,
    errorGutter,
    showPanel.of((view) => runPanel(view, onRunAll)),
    runTheme,
  ]
}
