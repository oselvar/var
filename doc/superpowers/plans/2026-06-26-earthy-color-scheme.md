# Earthy Color Scheme + Colorblind-Safe Editor Highlights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the website to an earthy "Umber & Linen" palette (light + warm-dark) and give the in-browser editor a matching, colorblind-safe color scheme where a matched step renders as a teal capsule joined to its param chip.

**Architecture:** The site is Aksel **foundation-only**, so our CSS is the sole consumer of the `--ax-*` tokens. We invert the existing token bridge in `global.css`: instead of reading Aksel's blue tokens, we *define* earthy values that override `--ax-*` under `:root,.light` and `.dark`. New mode-aware `--ed-*` (editor) and `--syn-*` (syntax) tokens let the CodeMirror themes adapt to light/dark automatically. The matched-step capsule is produced by a **pure transform** that extends the `function` token through the inter-token whitespace to its `parameter` token, so the two decoration spans render DOM-adjacent and CSS rounds only the outer corners.

**Tech Stack:** Astro 5 (static), Aksel `@navikt/ds-css@8.13.1` tokens, CodeMirror 6, `@codemirror/language` + `@lezer/highlight` (syntax theme), vitest.

## Global Constraints

- Trunk-based: commit each task straight to `main`, small and green.
- Do NOT stage or touch `packages/website/src/content/docs/concepts/your-docs-are-your-source.md` (user WIP).
- All work is under `packages/website/`. Run commands from `packages/website/` unless noted.
- Website unit tests run with: `npx vitest run <file>` from `packages/website/`.
- Website build: `pnpm --filter @oselvar/website build` (run from repo root).
- Colorblind invariant: pass/fail uses Okabe-Ito green `#009E73` / vermillion `#D55E00` **and** keeps the ✓/✗ gutter icons (never hue alone).
- Square corners already shipped (`--ax-radius-*: 0`, `--radius-5: 0`) — keep them.
- End every commit message with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/styles/global.css` | All theme tokens: earthy `--ax-*` overrides (light/dark), `--var-accent*`, legacy bridge aliases, `--ed-*`, `--syn-*`. |
| `src/lib/cm-var-theme.ts` *(new)* | CodeMirror `EditorView.theme` (editor surface) + earthy `HighlightStyle` (syntax), both via CSS vars. |
| `src/lib/var-capsule-tokens.ts` *(new)* | Pure `joinStepParamTokens` transform (function→parameter join). |
| `src/lib/cm-semantic-tokens.ts` | Add optional `transform` hook to `semanticTokens()`. |
| `src/lib/var-token-theme.ts` | Step band + param chip styling (the capsule). |
| `src/lib/cm-run.ts` | Pass/fail washes + ✓/✗ marks onto `--ed-*`. |
| `src/lib/cm-generate-step.ts` | Step-generation flash color → earthy. |
| `src/scripts/editor-mount.ts` | Wire the new theme extension + the token transform. |
| `src/components/FileEditor.astro` | Align the static docs code-window highlight colors. |

---

## Task 1: Earthy theme tokens in global.css

**Files:**
- Modify: `packages/website/src/styles/global.css` (the entire opening `:root { … }` block — currently ~22 lines including the square-corners section — up to its closing `}` just before the `*,\n*::before,` universal selector)

**Interfaces:**
- Produces (consumed by every later task and all existing components):
  - Earthy `--ax-*` semantic tokens (light under `:root,.light`, dark under `.dark`).
  - `--var-accent` / `--var-accent-strong` (mode-aware terracotta/tan).
  - Legacy aliases `--ink --cream --orange --yellow --accent` repointed.
  - Editor tokens: `--ed-bg --ed-text --ed-gutter --ed-selection --ed-pass-bg --ed-fail-bg --ed-pass-mark --ed-fail-mark --ed-step-bg --ed-step-text --ed-chip-bg --ed-chip-text --ed-flash`.
  - Syntax tokens: `--syn-keyword --syn-string --syn-comment --syn-function --syn-number --syn-heading --syn-meta`.

- [ ] **Step 1: Replace the `:root` block with the full earthy token layer**

Replace the entire current opening `:root { … }` block of `src/styles/global.css` (it currently holds `--var-accent`, `--var-accent-strong`, the legacy aliases, layout vars, and the square-corner `--ax-radius-*` / `--radius-5` overrides — it ends at the `}` just before the `*,\n*::before,\n*::after` universal selector) with:

```css
:root {
  /* Layout + mode-agnostic aliases. The actual color VALUES live in the
     :root,.light and .dark blocks below (earthy theme overrides Aksel). */
  --page-gutter: var(--ax-space-16);
  --content-max: 760px;

  /* Square corners (shipped) — our CSS is the only consumer of these tokens. */
  --ax-radius-4: 0;
  --ax-radius-8: 0;
  --ax-radius-12: 0;
  --radius-5: 0;

  /* Legacy brand names still used by FileEditor + the CodeMirror theme files.
     They resolve to the mode-aware tokens defined below. */
  --cream: var(--ax-bg-default);
  --ink: var(--ax-text-default);
  --orange: var(--var-accent);
  --yellow: var(--var-accent-strong);
  --accent: var(--ax-text-accent);
}

/* ── Earthy theme · LIGHT (Umber & Linen) ─────────────────────────────── */
:root,
.light {
  --ax-bg-default: #f4f0e6;            /* linen */
  --ax-bg-raised: #fbf8f0;             /* cards, editor, code */
  --ax-bg-sunken: #ece5d5;             /* fenced code blocks */
  --ax-text-default: #2a2017;          /* umber */
  --ax-text-subtle: #6b5d4c;
  --ax-text-neutral-subtle: #8a7b66;
  --ax-text-accent: #b0552f;           /* burnt sienna — links */
  --ax-text-accent-contrast: #fbf8f0;
  --ax-bg-accent-strong: #3b2e20;      /* brown buttons */
  --ax-bg-accent-strong-hover: #2a2017;
  --ax-border-subtle: #dcd3c0;
  --ax-border-neutral-subtle: #dcd3c0;
  --ax-border-default: #c8bba3;

  --var-accent: #b0552f;               /* identity accent (sienna) */
  --var-accent-strong: #c8924a;        /* warm tan (replaces yellow) */

  /* Editor */
  --ed-bg: #fbf8f0;
  --ed-text: #2a2017;
  --ed-gutter: #8a7b66;
  --ed-selection: #e4dac4;
  --ed-pass-bg: rgba(0, 158, 115, 0.15);
  --ed-fail-bg: rgba(213, 84, 0, 0.15);
  --ed-pass-mark: #009e73;
  --ed-fail-mark: #d55e00;
  --ed-step-bg: #5e9488;
  --ed-step-text: #fbf8f0;
  --ed-chip-bg: #3b2e20;
  --ed-chip-text: #f4f0e6;
  --ed-flash: rgba(94, 148, 136, 0.4);

  /* Syntax */
  --syn-keyword: #9a3e1b;
  --syn-string: #5e7a4e;
  --syn-comment: #a08c72;
  --syn-function: #7a5c2e;
  --syn-number: #8a5a2b;
  --syn-heading: #3b2e20;
  --syn-meta: #8a7b66;
}

/* ── Earthy theme · WARM DARK ─────────────────────────────────────────── */
.dark {
  --ax-bg-default: #17120d;
  --ax-bg-raised: #221a12;
  --ax-bg-sunken: #110d09;
  --ax-text-default: #efe7d7;
  --ax-text-subtle: #b7a892;
  --ax-text-neutral-subtle: #94866f;
  --ax-text-accent: #cc6b3c;           /* terracotta */
  --ax-text-accent-contrast: #17120d;
  --ax-bg-accent-strong: #cc6b3c;      /* terracotta buttons in dark */
  --ax-bg-accent-strong-hover: #d9743f;
  --ax-border-subtle: #3a2e22;
  --ax-border-neutral-subtle: #3a2e22;
  --ax-border-default: #6a523b;

  --var-accent: #cc6b3c;
  --var-accent-strong: #d9a441;

  /* Editor */
  --ed-bg: #221a12;
  --ed-text: #efe7d7;
  --ed-gutter: #7c6e58;
  --ed-selection: #3a2e22;
  --ed-pass-bg: rgba(0, 158, 115, 0.24);
  --ed-fail-bg: rgba(213, 84, 0, 0.26);
  --ed-pass-mark: #2fb88e;
  --ed-fail-mark: #f2772b;
  --ed-step-bg: #6fa89b;
  --ed-step-text: #17120d;
  --ed-chip-bg: #8a6b4a;
  --ed-chip-text: #17120d;
  --ed-flash: rgba(111, 168, 155, 0.45);

  /* Syntax */
  --syn-keyword: #e08a57;
  --syn-string: #9cbe82;
  --syn-comment: #7c6e58;
  --syn-function: #d4a24c;
  --syn-number: #d38b4e;
  --syn-heading: #efe7d7;
  --syn-meta: #94866f;
}
```

- [ ] **Step 2: Build and verify the earthy overrides win the cascade**

Run (from repo root): `pnpm --filter @oselvar/website build`
Expected: `Complete!`, 10 pages built.

Then verify ours is the last definition of `--ax-bg-default` in the bundled CSS:

```bash
cd packages/website
f=$(ls -t dist/_astro/*.css | head -1)
grep -oE '\-\-ax-bg-default: ?#?[0-9a-fA-F]+' "$f"
```
Expected: the list ends with `--ax-bg-default:#f4f0e6` (light) and `--ax-bg-default:#17120d` (dark) appearing **after** Aksel's `#fff` / `#0e151f`.

- [ ] **Step 3: Sanity-check no orphaned old brand hexes remain in CSS sources**

```bash
cd packages/website
grep -rnE '#ffd60a|#e67d00|#faf5e9|#1a1a1a' src/styles/global.css || echo "clean"
```
Expected: `clean` (the old yellow/orange literals are gone from global.css).

- [ ] **Step 4: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/styles/global.css
git commit -m "feat(website): earthy Umber & Linen theme tokens (light + warm-dark)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Earthy CodeMirror editor theme + syntax highlight

**Files:**
- Create: `packages/website/src/lib/cm-var-theme.ts`
- Modify: `packages/website/src/scripts/editor-mount.ts` (imports + extension list)
- Modify: `packages/website/package.json` (add two deps)

**Interfaces:**
- Consumes: `--ed-bg --ed-text --ed-gutter --ed-selection` and `--syn-*` (Task 1).
- Produces: `varEditorThemeExt(): Extension` — editor surface theme + earthy syntax highlighting, to be added to the editor extension list.

- [ ] **Step 1: Add the two CodeMirror deps**

In `packages/website/package.json`, under `dependencies`, add (keep alphabetical with the other `@codemirror/*` entries):

```json
"@codemirror/language": "^6.12.3",
"@lezer/highlight": "^1.2.3",
```

Then install: from repo root run `pnpm install`.
Expected: completes; `node -e "require.resolve('@lezer/highlight')"` prints nothing and exits 0 from `packages/website`.

- [ ] **Step 2: Create the theme file**

Create `packages/website/src/lib/cm-var-theme.ts`:

```ts
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
```

- [ ] **Step 3: Wire it into the editor extension list**

In `packages/website/src/scripts/editor-mount.ts`, add the import next to the other `../lib/*` imports:

```ts
import { varEditorThemeExt } from '../lib/cm-var-theme.ts'
```

Then in `mountEditor`, change the `ext` array (currently:
`const ext = [basicSetup, language, varTokenTheme, client.plugin(uri), autoRun, flashExtension()]`)
to add `varEditorThemeExt()` right after `language`:

```ts
const ext = [
  basicSetup,
  language,
  varEditorThemeExt(),
  varTokenTheme,
  client.plugin(uri),
  autoRun,
  flashExtension(),
]
```

- [ ] **Step 4: Build to verify it compiles and bundles**

Run (repo root): `pnpm --filter @oselvar/website build`
Expected: `Complete!`, 10 pages. (No runtime assertion here — visual check happens in Task 6.)

- [ ] **Step 5: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/lib/cm-var-theme.ts packages/website/src/scripts/editor-mount.ts packages/website/package.json pnpm-lock.yaml
git commit -m "feat(website): earthy CodeMirror editor surface + syntax theme

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Matched-step capsule (token join + styling)

**Files:**
- Create: `packages/website/src/lib/var-capsule-tokens.ts`
- Create: `packages/website/src/lib/var-capsule-tokens.test.ts`
- Modify: `packages/website/src/lib/cm-semantic-tokens.ts` (add `transform` option)
- Modify: `packages/website/src/scripts/editor-mount.ts` (pass the transform)
- Modify: `packages/website/src/lib/var-token-theme.ts` (capsule styling)

**Interfaces:**
- Consumes: `DecodedToken` (`{ line: number; char: number; length: number; type: string }`, exported from `cm-semantic-tokens.ts`); `--ed-step-bg --ed-step-text --ed-chip-bg --ed-chip-text` (Task 1).
- Produces: `joinStepParamTokens(tokens: ReadonlyArray<DecodedToken>): DecodedToken[]`; `semanticTokens(options: { legend: { tokenTypes: string[] }; transform?: (tokens: DecodedToken[]) => DecodedToken[] })`.

- [ ] **Step 1: Write the failing test for the join transform**

Create `packages/website/src/lib/var-capsule-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { joinStepParamTokens } from './var-capsule-tokens.js'

describe('joinStepParamTokens', () => {
  it('extends a function token through whitespace to its following parameter', () => {
    // function "I greet" at char 2 len 7; parameter ""world"" at char 10
    const tokens = [
      { line: 0, char: 2, length: 7, type: 'function' },
      { line: 0, char: 10, length: 7, type: 'parameter' },
    ]
    expect(joinStepParamTokens(tokens)).toEqual([
      { line: 0, char: 2, length: 8, type: 'function' }, // 10 - 2
      { line: 0, char: 10, length: 7, type: 'parameter' },
    ])
  })

  it('leaves a function with no following parameter unchanged', () => {
    const tokens = [{ line: 0, char: 0, length: 4, type: 'function' }]
    expect(joinStepParamTokens(tokens)).toEqual([
      { line: 0, char: 0, length: 4, type: 'function' },
    ])
  })

  it('does not join across lines', () => {
    const tokens = [
      { line: 0, char: 0, length: 3, type: 'function' },
      { line: 1, char: 0, length: 2, type: 'parameter' },
    ]
    expect(joinStepParamTokens(tokens)).toEqual(tokens)
  })

  it('joins each step on a line that has two steps', () => {
    const tokens = [
      { line: 0, char: 0, length: 7, type: 'function' },
      { line: 0, char: 8, length: 7, type: 'parameter' },
      { line: 0, char: 16, length: 6, type: 'function' },
      { line: 0, char: 23, length: 5, type: 'parameter' },
    ]
    expect(joinStepParamTokens(tokens)).toEqual([
      { line: 0, char: 0, length: 8, type: 'function' }, // 8 - 0
      { line: 0, char: 8, length: 7, type: 'parameter' },
      { line: 0, char: 16, length: 7, type: 'function' }, // 23 - 16
      { line: 0, char: 23, length: 5, type: 'parameter' },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/website && npx vitest run src/lib/var-capsule-tokens.test.ts`
Expected: FAIL — cannot resolve `./var-capsule-tokens.js` (module does not exist yet).

- [ ] **Step 3: Implement the transform**

Create `packages/website/src/lib/var-capsule-tokens.ts`:

```ts
import type { DecodedToken } from './cm-semantic-tokens.js'

// Pure: join a matched-step (`function`) token to an immediately-following
// `parameter` token on the same line by extending the function token's length
// to reach the parameter's start. This absorbs the inter-token whitespace so
// the two decorations render as one adjacent capsule. In the var grammar only
// whitespace ever sits between a step literal and its capture, so extending to
// the parameter start is always correct.
export function joinStepParamTokens(
  tokens: ReadonlyArray<DecodedToken>,
): DecodedToken[] {
  return tokens.map((tok, i) => {
    if (tok.type !== 'function') return { ...tok }
    const next = tokens[i + 1]
    if (
      next &&
      next.type === 'parameter' &&
      next.line === tok.line &&
      next.char >= tok.char + tok.length
    ) {
      return { ...tok, length: next.char - tok.char }
    }
    return { ...tok }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/website && npx vitest run src/lib/var-capsule-tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `transform` option to `semanticTokens`**

In `packages/website/src/lib/cm-semantic-tokens.ts`, change the `semanticTokens` signature (currently `export function semanticTokens(options: { legend: { tokenTypes: string[] } }): LSPClientExtension {`) to:

```ts
export function semanticTokens(options: {
  legend: { tokenTypes: string[] }
  transform?: (tokens: DecodedToken[]) => DecodedToken[]
}): LSPClientExtension {
```

Immediately after the existing `const fallbackTokenTypes = options.legend.tokenTypes` line, add:

```ts
  const transform = options.transform ?? ((tokens: DecodedToken[]) => tokens)
```

In `build`, change the decode loop header from
`for (const t of decodeSemanticTokens(data, tokenTypes)) {`
to:

```ts
    for (const t of transform(decodeSemanticTokens(data, tokenTypes))) {
```

- [ ] **Step 6: Pass the transform from the editor wiring**

In `packages/website/src/scripts/editor-mount.ts`, add the import:

```ts
import { joinStepParamTokens } from '../lib/var-capsule-tokens.ts'
```

Change the `semanticTokens({ legend: { tokenTypes: ['function', 'parameter'] } })` call (inside `lspClient()`) to:

```ts
      semanticTokens({
        legend: { tokenTypes: ['function', 'parameter'] },
        transform: joinStepParamTokens,
      }),
```

- [ ] **Step 7: Replace the underline with the capsule styling**

Replace the entire body of `packages/website/src/lib/var-token-theme.ts` with:

```ts
import { EditorView } from '@codemirror/view'

// A matched step and its parameter render as one capsule: a teal step band
// (--ed-step-bg) flowing into a brown param chip (--ed-chip-bg). The function
// token is extended through the inter-token whitespace (joinStepParamTokens)
// so the two spans are DOM-adjacent; here we round only the OUTER corners and
// square the touching seam.
export const varTokenTheme = EditorView.baseTheme({
  '.cm-token-function': {
    background: 'var(--ed-step-bg)',
    color: 'var(--ed-step-text)',
    borderRadius: '4px',
    padding: '1px 5px',
  },
  '.cm-token-parameter': {
    background: 'var(--ed-chip-bg)',
    color: 'var(--ed-chip-text)',
    borderRadius: '4px',
    padding: '1px 5px',
    fontWeight: '600',
  },
  // Seam: a step immediately followed by its param squares the touching corners
  // and drops the gap so they read as one continuous highlight.
  '.cm-token-function:has(+ .cm-token-parameter)': {
    borderTopRightRadius: '0',
    borderBottomRightRadius: '0',
    paddingRight: '0',
  },
  '.cm-token-function + .cm-token-parameter': {
    borderTopLeftRadius: '0',
    borderBottomLeftRadius: '0',
  },
})
```

- [ ] **Step 8: Run the full website test suite + build**

Run: `cd packages/website && npx vitest run`
Expected: all test files pass (including `var-capsule-tokens` and the unchanged `cm-semantic-tokens`).

Run (repo root): `pnpm --filter @oselvar/website build`
Expected: `Complete!`, 10 pages.

- [ ] **Step 9: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/lib/var-capsule-tokens.ts packages/website/src/lib/var-capsule-tokens.test.ts packages/website/src/lib/cm-semantic-tokens.ts packages/website/src/scripts/editor-mount.ts packages/website/src/lib/var-token-theme.ts
git commit -m "feat(website): matched-step capsule (teal band joined to param chip)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Earthy run + flash colors

**Files:**
- Modify: `packages/website/src/lib/cm-run.ts` (the `runTheme` baseTheme)
- Modify: `packages/website/src/lib/cm-generate-step.ts` (the `flashTheme` baseTheme)

**Interfaces:**
- Consumes: `--ed-pass-bg --ed-fail-bg --ed-pass-mark --ed-fail-mark --ed-flash` (Task 1).

- [ ] **Step 1: Recolor the run pass/fail washes and marks**

In `packages/website/src/lib/cm-run.ts`, in the `runTheme = EditorView.baseTheme({…})` block, change these four properties:

```ts
  '.cm-run-pass': { background: 'var(--ed-pass-bg)' },
  '.cm-run-fail': { background: 'var(--ed-fail-bg)' },
```
and
```ts
  '.cm-run-errmark': { color: 'var(--ed-fail-mark)', cursor: 'pointer', fontWeight: '700' },
  '.cm-run-passmark': { color: 'var(--ed-pass-mark)', fontWeight: '700' },
```

Also change the dialog backdrop from `'.cm-run-dialog::backdrop': { background: 'rgba(26, 26, 26, 0.5)' },` to:

```ts
  '.cm-run-dialog::backdrop': { background: 'rgba(23, 18, 13, 0.55)' },
```

(The dialog/stack backgrounds use `var(--ink)` / `var(--cream)` and re-theme automatically — leave them.)

- [ ] **Step 2: Recolor the step-generation flash**

In `packages/website/src/lib/cm-generate-step.ts`, in `flashTheme`, change
`'.cm-stepgen-flash': { backgroundColor: 'rgba(255, 46, 136, 0.28)', transition: 'background-color 0.4s ease' },`
to:

```ts
  '.cm-stepgen-flash': {
    backgroundColor: 'var(--ed-flash)',
    transition: 'background-color 0.4s ease',
  },
```

(The stepgen button uses `var(--yellow)` / `var(--ink)` and re-themes automatically — leave it.)

- [ ] **Step 3: Build to verify**

Run (repo root): `pnpm --filter @oselvar/website build`
Expected: `Complete!`, 10 pages.

Then confirm no raw pink/green run literals remain:

```bash
cd packages/website
grep -nE '255, ?46, ?136|40, ?167, ?69|#28a745' src/lib/cm-run.ts src/lib/cm-generate-step.ts || echo "clean"
```
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/lib/cm-run.ts packages/website/src/lib/cm-generate-step.ts
git commit -m "feat(website): earthy pass/fail washes, marks, and step-gen flash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Align the FileEditor docs code-window highlight

**Files:**
- Modify: `packages/website/src/components/FileEditor.astro:162-174` (the `.fe-step` and `.fe-param` rules)

**Interfaces:**
- None new. FileEditor is a fixed dark "terminal" window (its background is `var(--ink)`), so its highlight colors are set as literals that read on a dark surface and mirror the editor's dark-mode highlight values.

- [ ] **Step 1: Replace `.fe-step` (underline) with a teal band, and make `.fe-param` readable**

In `packages/website/src/components/FileEditor.astro`, replace this block:

```css
  .fe-step {
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  .fe-param {
    background: var(--accent);
    color: var(--ink);
    border-radius: 4px;
    padding: 1px 5px;
  }
```

with:

```css
  .fe-step {
    background: #5e9488;
    color: #fbf8f0;
    border-radius: 4px;
    padding: 1px 5px;
  }

  .fe-param {
    background: #c8924a;
    color: #1a130d;
    border-radius: 4px;
    padding: 1px 5px;
    font-weight: 600;
  }
```

(The window chrome — `.fe-bar` `var(--yellow)`, the dots `var(--accent)`/`var(--orange)`/`var(--cream)`, and the `var(--ink)` body — re-theme automatically via Task 1.)

- [ ] **Step 2: Build to verify**

Run (repo root): `pnpm --filter @oselvar/website build`
Expected: `Complete!`, 10 pages.

- [ ] **Step 3: Commit**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add packages/website/src/components/FileEditor.astro
git commit -m "feat(website): align FileEditor highlight to teal step + readable chip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Whole-site verification (both themes)

**Files:**
- None (verification only). May produce small follow-up fixes committed here.

- [ ] **Step 1: Full build + unit tests green**

Run (repo root): `pnpm --filter @oselvar/website build` → `Complete!`, 10 pages.
Run: `cd packages/website && npx vitest run` → all pass.

- [ ] **Step 2: Grep for leftover pre-earthy colors across the website source**

```bash
cd packages/website
grep -rnE '#ffd60a|#e67d00|#faf5e9|navy|rgba\(255, ?46, ?136' src/ || echo "clean"
```
Expected: `clean` (no old yellow/orange/pink/navy literals in source).

- [ ] **Step 3: Start preview and smoke-test both themes**

Run: `cd packages/website && pnpm preview` (serves `dist` at http://localhost:4321/var/).
In the browser, toggle light ⇄ warm-dark (top-bar toggle) and verify on **front page**, **/docs/**, **a doc page** (e.g. `/docs/start-here/hello-var-your-first-spec`), and **/playground**:

- Background is sand/linen (light) or deep umber (dark); body text readable.
- Buttons are deep brown (light) / terracotta (dark); links are sienna/terracotta.
- No leftover blue/navy chrome anywhere.
- Playground editor: param chips are **readable** (light text on brown/tan, not dark-on-dark); a matched step is a **teal capsule** that joins straight into its param chip with only the outer corners rounded; syntax keywords/strings are earthy (not blue/purple); editor background matches the theme.
- Type into the spec editor to trigger a run: a passing line gets a green wash + ✓, a failing line gets a vermillion wash + ✗.
- FileEditor windows on the tutorial doc show teal step + readable param chip.

- [ ] **Step 4: Commit any fixes found (if none, skip)**

```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
git add -A -- packages/website
git commit -m "fix(website): earthy theme smoke-test fixes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(If Step 3 surfaces no issues, there is nothing to commit — the feature is complete.)

---

## Notes for the implementer

- **Cascade ordering matters.** `global.css` is imported *after* the Aksel CSS in `Base.astro`, and our `:root,.light` / `.dark` selectors have the same specificity as Aksel's, so they win by source order. Task 1 Step 2 verifies this in the bundled output — don't skip it.
- **Why `transform` is an option, not hardcoded.** `cm-semantic-tokens.ts` is a generic, server-agnostic extension; the var-specific capsule join lives in `var-capsule-tokens.ts` and is injected via the option, keeping the generic extension clean (`@oselvar/var` core is untouched — hexagonal boundary preserved).
- **Why a non-fallback `syntaxHighlighting` overrides basicSetup.** `basicSetup` registers `syntaxHighlighting(defaultHighlightStyle, { fallback: true })`; a non-fallback highlighter (ours) takes precedence, so no `Prec` juggling is needed.
- **Adjacent-sibling CSS works through the join.** Once the function token is extended to the param's start, CodeMirror renders the two marks as adjacent `<span>`s (the trailing space is inside the teal span), so `.cm-token-function + .cm-token-parameter` and `:has(+ …)` match and produce the seam.
```
