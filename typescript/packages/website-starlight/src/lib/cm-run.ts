import { type Diagnostic, linter } from '@codemirror/lint'
import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { runResultDiagnostics, type SpecResults } from '@oselvar/var-core'

// Effect carrying the latest run results (null clears them).
export const setRunResults = StateEffect.define<SpecResults | null>()

const resultsField = StateField.define<SpecResults | null>({
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

// Pure projection used by the linter and unit-tested directly.
export function varDiagnostics(results: SpecResults | null, docText: string): Diagnostic[] {
  if (!results) return []
  return runResultDiagnostics(results, docText).map((d) => ({
    from: d.from,
    to: d.to,
    severity: 'error',
    message: d.message,
  }))
}

const runLinter = linter(
  (view) => varDiagnostics(view.state.field(resultsField), view.state.doc.toString()),
  // Results arrive via the setRunResults effect, not a doc change — re-lint then.
  { needsRefresh: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setRunResults))) },
)

const runTheme = EditorView.baseTheme({
  // `.cm-line` prefix raises specificity above `.cm-activeLine` so the run
  // wash always wins on the cursor's active line (both are line decorations on
  // the same element). The active-line highlight itself is neutralised in
  // cm-var-theme (background: transparent).
  '.cm-line.cm-run-pass': { background: 'var(--ed-pass-bg)' },
  '.cm-line.cm-run-fail': { background: 'var(--ed-fail-bg)' },
})

// Renders run results (line backgrounds + inline lint diagnostics). Runs are
// triggered by the host (debounced on every edit) — no buttons. No lint gutter:
// failures show as the line-background wash plus the inline diagnostic on hover,
// so the gutter column (and its marker) is unnecessary.
export function varRunExtension(): Extension {
  return [resultsField, decoField, runLinter, runTheme]
}
