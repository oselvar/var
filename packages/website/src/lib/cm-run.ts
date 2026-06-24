import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutter } from '@codemirror/view'
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
        builder.add(
          tr.state.doc.line(ln).from,
          tr.state.doc.line(ln).from,
          Decoration.line({ class: cls(status) }),
        )
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
      // Native <dialog>: showModal() promotes it to the top layer (so it's
      // viewport-fixed and never clipped/scrolled by the editor), Esc dismisses
      // it for free, and click-outside is one line. Appending it inside the
      // editor keeps the baseTheme styling.
      const host = el.closest('.cm-editor') ?? document.body
      host.querySelectorAll('dialog.cm-run-dialog').forEach((d) => d.remove())
      const dialog = document.createElement('dialog')
      dialog.className = 'cm-run-dialog'
      const pre = document.createElement('pre')
      pre.className = 'cm-run-stack'
      pre.textContent = this.stack
      dialog.appendChild(pre)
      // A click on the dialog element itself (not its <pre> content) is the backdrop.
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close()
      })
      dialog.addEventListener('close', () => dialog.remove())
      host.appendChild(dialog)
      dialog.showModal()
    }
    return el
  }
}

class PassMarker extends GutterMarker {
  eq(other: GutterMarker): boolean {
    return other instanceof PassMarker
  }
  toDOM(_view: EditorView): Node {
    const el = document.createElement('span')
    el.textContent = '✓'
    el.className = 'cm-run-passmark'
    el.title = 'This example passes'
    return el
  }
}
const PASS_MARKER = new PassMarker()

const errorGutter = gutter({
  class: 'cm-run-gutter',
  lineMarker(view, line) {
    const results = view.state.field(resultsField)
    if (!results) return null
    const lineNo = view.state.doc.lineAt(line.from).number
    for (const ex of results.examples) {
      if (ex.status === 'failed' && ex.failure?.line === lineNo) {
        return new ErrorMarker(ex.failure.stack)
      }
      if (ex.status === 'passed' && ex.lines.length > 0 && Math.min(...ex.lines) === lineNo) {
        return PASS_MARKER
      }
    }
    return null
  },
  // Recompute markers when run results change (they arrive via a StateEffect,
  // not a doc change, so the gutter wouldn't otherwise refresh).
  lineMarkerChange: (update) =>
    update.transactions.some((tr) => tr.effects.some((e) => e.is(setRunResults))),
})

const runTheme = EditorView.baseTheme({
  '.cm-run-pass': { background: 'rgba(40, 167, 69, 0.18)' },
  '.cm-run-fail': { background: 'rgba(255, 46, 136, 0.18)' },
  // Reserve a fixed width so the gutter doesn't jitter as ✗ markers come and go.
  '.cm-run-gutter': { width: '1.4em', minWidth: '1.4em' },
  '.cm-run-gutter .cm-gutterElement': { textAlign: 'center' },
  '.cm-run-errmark': { color: 'var(--accent)', cursor: 'pointer', fontWeight: '700' },
  '.cm-run-passmark': { color: '#28a745', fontWeight: '700' },
  '.cm-run-dialog': {
    padding: '0',
    border: '2px solid var(--ink)',
    borderRadius: '8px',
    maxWidth: 'min(90vw, 800px)',
    background: 'var(--ink)',
  },
  '.cm-run-dialog::backdrop': { background: 'rgba(26, 26, 26, 0.5)' },
  '.cm-run-stack': {
    margin: '0',
    padding: '16px',
    maxHeight: '70vh',
    overflow: 'auto',
    background: 'var(--ink)',
    color: 'var(--cream)',
    borderRadius: '6px',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
  },
})

// Renders run results (line backgrounds + error gutter). Runs are triggered by
// the host (debounced on every edit) — no buttons.
export function varRunExtension(): Extension {
  return [resultsField, decoField, errorGutter, runTheme]
}
