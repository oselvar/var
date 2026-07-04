# Generate a step definition from a selection (playground)

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan

## Context

The browser playground (`packages/website/src/pages/playground.astro`) renders
two CodeMirror editors backed by one in-browser Vár LSP worker: a `.var.md` spec
and its `.steps.ts` step definitions. Editing either re-runs the spec and repaints
matches/results live.

Today, when a sentence in the spec has no matching step definition, there is
nothing surfaced (by design — step-def generation is **selection-driven only**,
never inferred from sentence shape; see `packages/var/src/plan.ts`). The author
has no in-playground way to turn a phrase into a step definition.

This feature adds that: **select a phrase in the spec → an affordance appears →
confirm it → a generated step definition lands in the `.steps.ts` editor,
selected and flashed.**

The generation logic already exists end-to-end and is reused unchanged:

- Core: `generateSnippet(text, registry, { template? }) → { expression, handlerSignature, fullCode }`
  in `packages/var/src/snippet.ts` (already unit-tested).
- Worker request: `var/generateSnippet { text } → { fullCode, expression }`,
  handled in `packages/var-lsp` and exposed by the browser worker
  (`packages/website/src/lib/var-worker.ts`). It uses the **live indexed
  registry**, so custom parameter types defined in the `.steps.ts` are in scope.
- The VSCode extension (`packages/var-vscode/src/extension.ts`) already does this
  exact flow (select → `var/generateSnippet` → append to a steps file). This is
  the CodeMirror analog of that command.

So this is **client-side wiring only** — no changes to the core, the LSP, or the
worker protocol.

## Goal & flow

1. Author selects a phrase in the `.var.md` editor.
2. When the selection settles (non-empty, debounced), a small **affordance**
   appears anchored to the selection: a floating "✨ Create step definition"
   button.
3. Author confirms — **click** the button, or press **Enter** while the affordance
   is showing.
4. The selected text is sent to the worker; a `step('…', (ctx, …) => { … })` block
   comes back.
5. The block is **appended** to the `.steps.ts` editor (blank-line separated,
   mirroring the VSCode `appendSnippet` behavior).
6. The steps editor is focused, the inserted block is **selected**, scrolled into
   view, and briefly **flashed** to draw the eye.

Nothing is written until step 3. A selection made to copy/delete/read just shows
the affordance, which vanishes on Escape or when the selection changes/clears.

**Emergent bonus:** inserting into `.steps.ts` changes its document, which fires
the existing debounced auto-run (`editor-mount.ts`). The spec re-runs, the
formerly-unmatched step now matches, and that spec line goes green on its own.

## Decisions

- **Trigger: an on-selection affordance, not a keystroke.** It appears
  automatically when a non-empty selection settles, but writes nothing until
  confirmed — so accidental selections are harmless, and there is no shortcut to
  memorize. Implemented with CodeMirror's tooltip system anchored to the selection.
- **Settling / debounce.** A `ViewPlugin` watches `update.selectionSet`; on change
  it (re)arms a ~200 ms timer, then dispatches an effect carrying the current
  non-empty selection range (or `null`). This avoids the affordance flickering
  mid-drag and only shows it once the selection is stable.
- **Confirm = click or Enter.** While the affordance is showing, a `Prec.highest`
  keymap binds `Enter` to "create step + dismiss" and returns `true` (so it does
  not fall through to the default "replace selection with newline"). When the
  affordance is not showing, `Enter` behaves normally. `Escape` dismisses.
- **Bound only on the markdown (`.var.md`) editor.**
- **Append at end of the steps file**, one blank-line separator, file ends with a
  newline. `runGenerateStepDef` resolves with the inserted range so callers/tests
  can assert it.
- **Scripting/automation uses the CodeMirror API directly** — `view.dispatch`,
  `EditorSelection`, `state.doc.line(n)`. We deliberately build **no** wrapper /
  fluent layer, and the affordance is pure UI sugar a script ignores. A scripted
  session positions the selection with raw CM API and calls the one command we
  author:

  ```ts
  // "click on 5,3; select +13"; then generate
  const at = specView.state.doc.line(5).from + 2 // 1-based line, col → offset
  specView.dispatch({ selection: EditorSelection.range(at, at + 13) })
  await runGenerateStepDef({ specView, stepsView, generate })
  ```

- **`generate` is an injected port** so the same orchestration runs two ways:
  - app: `(text) => lspClient().request('var/generateSnippet', { text })`
  - test: `(text) => Promise.resolve(generateSnippet(text, registry))` — fast,
    deterministic, no worker or DOM.

- **`runGenerateStepDef` is await-able.** The affordance's click/Enter handler
  fires it (`void`, fire-and-forget for the UI); scripts and tests `await` it when
  they need the insert to complete before continuing.

## Out of scope (noted for later)

- **Skip / dim if already defined.** If the selection already matches an existing
  step, we still offer generation (and would still produce one, like VSCode). A
  future refinement can suppress or grey the affordance using `findHits` from
  `packages/var/src/matcher.ts`.
- Multiple steps files / a file picker (the playground has exactly one
  `.steps.ts`). The VSCode QuickPick flow stays VSCode-only.
- TS types beyond `number`/`string`; custom parameter types always render as
  `string` in the snippet (a core property of `generateSnippet`, unchanged here).

## Components

One new module; one wiring change. Nothing else changes.

### `packages/website/src/lib/cm-generate-step.ts` (new)

**Pure core (the test seam):**

- `appendStepDef(stepsDoc: string, fullCode: string): { changes: ChangeSpec; from: number; to: number }`
  — pure placement logic: computes the append position at EOF, ensures a single
  blank-line separator, trims trailing whitespace, ensures a final newline, and
  returns the change plus the `[from, to)` offsets of the inserted block. No
  CodeMirror view, no DOM, no worker.

**Orchestration (narrowed to the CM API surface it uses, so it is headless-testable):**

- `type EditorLike = { state: EditorState; dispatch: (tr: TransactionSpec) => void; focus?: () => void }`
  — `EditorView` satisfies this; a test can pass an `EditorState` plus a capturing
  `dispatch`, with no DOM.
- `type GenerateSnippet = (text: string) => Promise<{ fullCode: string; expression: string }>`
- `runGenerateStepDef(opts: { specView: EditorLike; stepsView: EditorLike; generate: GenerateSnippet }): Promise<{ from: number; to: number; expression: string } | null>`:
  1. Read the primary selection from `specView`; if empty, return `null`.
  2. `const { fullCode, expression } = await generate(selectedText)`.
  3. `const { changes, from, to } = appendStepDef(stepsView.state.doc.toString(), fullCode)`.
  4. `stepsView.dispatch({ changes, selection: EditorSelection.range(from, to), effects: flashRange.of({ from, to }), scrollIntoView: true })`.
  5. `stepsView.focus?.()`; return `{ from, to, expression }`.

**View layer (the affordance + flash; DOM, browser-only):**

- `flashRange` (`StateEffect`) + a `StateField<DecorationSet>` adding
  `Decoration.mark({ class: 'cm-stepgen-flash' })` over the range, plus a view
  plugin that dispatches a clear effect after ~600 ms. Themed via `baseTheme`.
- `stepGenAffordance(deps: { generate: GenerateSnippet; stepsView: () => EditorView | null }): Extension`
  returns the bundle:
  - a `StateField<readonly Tooltip[]>` (provided to `showTooltip`) that renders the
    "✨ Create step definition" button when an affordance range is active; the
    button's `onclick` calls `runGenerateStepDef({ specView, stepsView: deps.stepsView(), generate: deps.generate })` then dismisses;
  - a debounce `ViewPlugin` (above) that drives the affordance range via an effect;
  - a `Prec.highest` keymap for `Enter` (confirm, only when active) and `Escape`
    (dismiss);
  - the `flashRange` field + theme.

### `packages/website/src/scripts/editor-mount.ts` (change)

- In the existing `if (lang === 'markdown')` branch, push
  `stepGenAffordance({ generate, stepsView })`, where:
  - `generate = (text) => lspClient().request('var/generateSnippet', { text })`
    (the shared `LSPClient` already exposes a public `request(method, params)`).
  - `stepsView = () => [...views.entries()].find(([u]) => u.endsWith('.steps.ts'))?.[1] ?? null`
    (reuses the existing module-level `views` map).

## Data flow

```
spec selection settles ─▶ debounce ─▶ affordance tooltip shown
        │ (click / Enter)
        ▼
runGenerateStepDef ── generate(text) ── var/generateSnippet ──▶ worker
        │                       ◀── { fullCode, expression } ──┘
   appendStepDef(stepsDoc, fullCode)            [pure]
        │ { changes, from, to }
   stepsView.dispatch(changes + select + flash + scroll); focus
        │
   (doc changed) ─▶ existing debounced auto-run ─▶ spec line turns green
```

## Error handling

- **Empty / cleared selection:** no affordance; nothing happens.
- **No steps view found:** the confirm handler no-ops.
- **Worker request rejects / times out:** `runGenerateStepDef` rejects; the UI
  handler swallows it (`void`); **no document mutation occurs** because the
  dispatch happens only after `await generate` resolves. (A user-facing error
  surface is out of scope; the playground has no toast system.)

## Testing

The repo's website tests are pure functions in the **node** env (no DOM); this
design keeps the testable logic pure so it fits that pattern.

- **Unit (vitest, website package):** `appendStepDef` — separator/placement, empty
  file, file without trailing newline, multiple successive appends. Pure
  string-in/spec-out. The core `generateSnippet` already has its own tests.
- **Orchestration (headless, no DOM):** `runGenerateStepDef` against two
  `EditorState`s wrapped as `EditorLike` (state + capturing `dispatch`), with a
  stub `generate`. Assert the resulting steps document and selection. Uses only
  the CodeMirror state API — the same surface a demo script drives.
- **Affordance UI** (tooltip show/hide, Enter/Escape, debounce) is view-layer and
  DOM-bound; covered manually in the browser, not in the node test suite.
