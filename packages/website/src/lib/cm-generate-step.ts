import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
  StateEffect,
  StateField,
  type TransactionSpec,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  showTooltip,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'

// Pure: compute the change that appends `fullCode` to the end of `stepsDoc`,
// separated from existing content by exactly one blank line, with a trailing
// newline. Returns the change plus the [from, to) offsets of the inserted
// block in the resulting document.
export function appendStepDef(
  stepsDoc: string,
  fullCode: string,
): { changes: ChangeSpec; from: number; to: number } {
  const block = fullCode.trim()
  const body = stepsDoc.replace(/\s*$/, '') // existing content without trailing whitespace
  if (body.length === 0) {
    return {
      changes: { from: 0, to: stepsDoc.length, insert: `${block}\n` },
      from: 0,
      to: block.length,
    }
  }
  const insert = `\n\n${block}\n`
  const from = body.length + 2
  return {
    changes: { from: body.length, to: stepsDoc.length, insert },
    from,
    to: from + block.length,
  }
}

// A subset of EditorView this module needs — so the orchestration can be
// driven headlessly (an EditorState plus a capturing dispatch) in node tests.
export type EditorLike = {
  state: EditorState
  dispatch: (tr: TransactionSpec) => void
  focus?: () => void
}

export type GenerateSnippet = (
  text: string,
  position?: { line: number; character: number },
) => Promise<{ fullCode: string; expression: string }>

// Carries the range to flash after an insert (null clears it).
export const flashRange = StateEffect.define<{ from: number; to: number } | null>()

export async function runGenerateStepDef(opts: {
  specView: EditorLike
  stepsView: EditorLike
  generate: GenerateSnippet
}): Promise<{ from: number; to: number; expression: string } | null> {
  const sel = opts.specView.state.selection.main
  if (sel.empty) return null
  const text = opts.specView.state.sliceDoc(sel.from, sel.to)
  // Derive the 0-based LSP position of the selection start so the server can
  // infer the step role from the surrounding matched steps.
  const line = opts.specView.state.doc.lineAt(sel.from)
  const position = { line: line.number - 1, character: sel.from - line.from }
  const { fullCode, expression } = await opts.generate(text, position)
  const { changes, from, to } = appendStepDef(opts.stepsView.state.doc.toString(), fullCode)
  opts.stepsView.dispatch({
    changes,
    selection: EditorSelection.range(from, to),
    effects: flashRange.of({ from, to }),
    scrollIntoView: true,
  })
  opts.stepsView.focus?.()
  return { from, to, expression }
}

const flashMark = Decoration.mark({ class: 'cm-stepgen-flash' })

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(flashRange)) {
        deco = e.value
          ? Decoration.set([flashMark.range(e.value.from, e.value.to)])
          : Decoration.none
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Clears the flash ~600ms after it is set (view-layer; uses window timers).
const flashClearPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate): void {
      for (const tr of u.transactions) {
        for (const e of tr.effects) {
          if (e.is(flashRange) && e.value) {
            clearTimeout(this.timer)
            this.timer = setTimeout(() => this.view.dispatch({ effects: flashRange.of(null) }), 600)
          }
        }
      }
    }
    destroy(): void {
      clearTimeout(this.timer)
    }
  },
)

const flashTheme = EditorView.baseTheme({
  '.cm-stepgen-flash': {
    backgroundColor: 'var(--ed-flash)',
    transition: 'background-color 0.4s ease',
  },
})

export function flashExtension(): Extension {
  return [flashField, flashClearPlugin, flashTheme]
}

export const setAffordance = StateEffect.define<{ from: number; to: number } | null>()

export const affordanceField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setAffordance)) return e.value
    // A selection change that didn't explicitly set the affordance dismisses it.
    if (tr.selection) return null
    return value
  },
})

async function confirmAffordance(
  view: EditorView,
  deps: { generate: GenerateSnippet; stepsView: () => EditorView | null },
): Promise<void> {
  const stepsView = deps.stepsView()
  view.dispatch({ effects: setAffordance.of(null) })
  if (!stepsView) return
  await runGenerateStepDef({ specView: view, stepsView, generate: deps.generate })
}

const affordanceTheme = EditorView.baseTheme({
  '.cm-stepgen-tooltip': { border: 'none', background: 'transparent' },
  '.cm-stepgen-btn': {
    font: 'inherit',
    fontSize: '13px',
    fontWeight: '600',
    padding: '4px 10px',
    cursor: 'pointer',
    color: 'var(--ink)',
    background: 'var(--yellow)',
    border: '2px solid var(--ink)',
    borderRadius: 'var(--radius-5, 6px)',
    boxShadow: '3px 3px 0 0 var(--ink)',
  },
})

export function stepGenAffordance(deps: {
  generate: GenerateSnippet
  stepsView: () => EditorView | null
}): Extension {
  // The tooltip's button needs the spec EditorView to run the command. Resolve
  // it via the tooltip create() argument (CodeMirror passes the view).
  const tooltipFromField = showTooltip.compute([affordanceField], (state): Tooltip | null => {
    const range = state.field(affordanceField)
    if (!range) return null
    return {
      pos: range.to,
      above: true,
      strictSide: false,
      create(view) {
        const dom = document.createElement('div')
        dom.className = 'cm-stepgen-tooltip'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'cm-stepgen-btn'
        btn.textContent = '✨ Define step definition'
        btn.addEventListener('mousedown', (e) => e.preventDefault())
        btn.addEventListener('click', () => void confirmAffordance(view, deps))
        dom.appendChild(btn)
        return { dom }
      },
    }
  })

  // Show the affordance only once a non-empty selection settles (debounced),
  // and hide it immediately when the selection clears.
  const debouncePlugin = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate): void {
        if (!u.selectionSet && !u.docChanged) return
        const sel = u.state.selection.main
        clearTimeout(this.timer)
        if (sel.empty) {
          if (this.view.state.field(affordanceField)) {
            this.view.dispatch({ effects: setAffordance.of(null) })
          }
          return
        }
        const { from, to } = sel
        this.timer = setTimeout(
          () => this.view.dispatch({ effects: setAffordance.of({ from, to }) }),
          200,
        )
      }
      destroy(): void {
        clearTimeout(this.timer)
      }
    },
  )

  const confirmKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Enter',
        run: (view) => {
          if (!view.state.field(affordanceField)) return false
          void confirmAffordance(view, deps)
          return true
        },
      },
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(affordanceField)) return false
          view.dispatch({ effects: setAffordance.of(null) })
          return true
        },
      },
    ]),
  )

  return [affordanceField, tooltipFromField, debouncePlugin, confirmKeymap, affordanceTheme]
}
