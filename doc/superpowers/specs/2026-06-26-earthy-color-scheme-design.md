# Earthy Color Scheme + Colorblind-Safe Editor Highlights — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm complete)
**Area:** `packages/website`

## Goal

Replace the site's blue/navy Aksel chrome with an **earthy** palette (deep-brown
chrome, light-sand background, terracotta accent) in both light and a new
**warm-dark** theme, and give the in-browser editor a matching color scheme.
Rework the LSP highlighting so a matched step definition is shown with a
**background highlight** (not an underline), and make all three editor
highlight layers — pass/fail, matched step, cucumber param — **colorblind-safe**.

## Background / current state

- The site is Aksel **foundation-only** (tokens + CSS, no React components). Our
  own CSS is the *sole* consumer of the `--ax-*` semantic tokens.
- `packages/website/src/styles/global.css` `:root` is a **token bridge**: legacy
  Vár vars (`--ink`, `--cream`, `--accent`, `--orange`, `--yellow`, `--radius-5`)
  currently *read from* `--ax-*` tokens. This redesign **inverts** that: we now
  *define* earthy values and override the `--ax-*` tokens we consume.
- Aksel token structure (confirmed in `tokens.css`): light values under
  `:root, :host, .light`; dark under `.dark, .dark-theme`. Theme switching is a
  `light`/`dark` class on `<html>` set by the pre-paint script in `Base.astro`.
- The editor is CodeMirror (`basicSetup`) mounted in `editor-mount.ts`. Color
  lives in: `var-token-theme.ts` (step/param), `cm-run.ts` (pass/fail),
  `cm-generate-step.ts` (flash + button), and the `basicSetup` default light
  syntax theme (the only place the TS/markdown keyword colors come from).
- Today's param chip renders `background: var(--accent)` (navy) + `color:
  var(--ink)` (also navy) → **unreadable dark-on-dark**. This redesign fixes it.

## Palette — Umber & Linen

### Chrome (light)

| Role | Token(s) overridden | Value |
|---|---|---|
| Page background (linen) | `--ax-bg-default` | `#F4F0E6` |
| Raised surface (cards, editor, code) | `--ax-bg-raised` | `#FBF8F0` |
| Sunken surface (fenced code blocks) | `--ax-bg-sunken` | `#ECE5D5` |
| Text (umber) | `--ax-text-default` | `#2A2017` |
| Muted text | `--ax-text-subtle` | `#6B5D4C` |
| Faint text (captions/meta) | `--ax-text-neutral-subtle` | `#8A7B66` |
| Accent / links (burnt sienna) | `--ax-text-accent` | `#B0552F` |
| Accent contrast (text on accent) | `--ax-text-accent-contrast` | `#FBF8F0` |
| Button / strong chrome (brown) | `--ax-bg-accent-strong` | `#3B2E20` |
| Button hover | `--ax-bg-accent-strong-hover` | `#2A2017` |
| Subtle border | `--ax-border-subtle`, `--ax-border-neutral-subtle` | `#DCD3C0` |
| Default border | `--ax-border-default` | `#C8BBA3` |

### Chrome (warm-dark)

| Role | Token(s) | Value |
|---|---|---|
| Page background | `--ax-bg-default` | `#17120D` |
| Raised surface | `--ax-bg-raised` | `#221A12` |
| Sunken surface | `--ax-bg-sunken` | `#110D09` |
| Text | `--ax-text-default` | `#EFE7D7` |
| Muted text | `--ax-text-subtle` | `#B7A892` |
| Faint text | `--ax-text-neutral-subtle` | `#94866F` |
| Accent / links (terracotta) | `--ax-text-accent` | `#CC6B3C` |
| Accent contrast | `--ax-text-accent-contrast` | `#17120D` |
| Button / strong chrome (terracotta) | `--ax-bg-accent-strong` | `#CC6B3C` |
| Button hover | `--ax-bg-accent-strong-hover` | `#D9743F` |
| Subtle border | `--ax-border-subtle`, `--ax-border-neutral-subtle` | `#3A2E22` |
| Default border | `--ax-border-default` | `#6A523B` |

> In light, the primary button is **deep brown** with light text; in warm-dark it
> becomes **terracotta** with dark text (matches the approved chrome mockup).

### Vár identity vars (mode-aware)

`--var-accent` / `--var-accent-strong` are the identity accent (hero rune, the
`$` install prompt, the quote-mark glyph, the CTA-secondary underline, the
docs-nav separators, the blockquote rule). Retune from orange/yellow to:

| | light | dark |
|---|---|---|
| `--var-accent` (terracotta/sienna) | `#B0552F` | `#CC6B3C` |
| `--var-accent-strong` (warm tan, replaces yellow) | `#C8924A` | `#D9A441` |

### Legacy bridge vars

Keep the legacy names (still referenced by `FileEditor.astro`, the CM theme
files, and `.doc-*` styles) but repoint them:

- `--ink` → `var(--ax-text-default)` (umber light / cream dark) — *unchanged mapping*
- `--cream` → `var(--ax-bg-default)` — *unchanged mapping*
- `--accent` → `var(--ax-text-accent)` (now sienna, not navy)
- `--orange` → `var(--var-accent)`
- `--yellow` → `var(--var-accent-strong)` (now warm tan, not `#ffd60a`)
- `--radius-5` → `0` — *unchanged (square corners, already shipped)*

## Editor highlight tokens (mode-aware)

Introduce **semantic editor tokens** in `global.css` under `.light` / `.dark`,
so the CodeMirror themes reference `var(--ed-*)` and adapt to the mode
automatically (CSS vars resolve at render against the cascade):

| Token | light | dark | Meaning |
|---|---|---|---|
| `--ed-bg` | `#FBF8F0` | `#221A12` | editor surface |
| `--ed-text` | `#2A2017` | `#EFE7D7` | base text |
| `--ed-gutter` | `#8A7B66` | `#7C6E58` | line numbers |
| `--ed-selection` | `#E4DAC4` | `#3A2E22` | selection bg |
| `--ed-pass-bg` | `rgba(0,158,115,.15)` | `rgba(0,158,115,.24)` | passing-row wash |
| `--ed-fail-bg` | `rgba(213,84,0,.15)` | `rgba(213,84,0,.26)` | failing-row wash |
| `--ed-pass-mark` | `#009E73` | `#2FB88E` | ✓ gutter mark |
| `--ed-fail-mark` | `#D55E00` | `#F2772B` | ✗ gutter mark |
| `--ed-step-bg` | `#5E9488` | `#6FA89B` | matched-step band (dusty teal) |
| `--ed-step-text` | `#FBF8F0` | `#17120D` | text on step band |
| `--ed-chip-bg` | `#3B2E20` | `#8A6B4A` | param chip (brown light / tan dark) |
| `--ed-chip-text` | `#F4F0E6` | `#17120D` | text on param chip |

**Colorblind rationale (validated via deuteranopia/protanopia/tritanopia
simulation):** pass/fail use the Okabe–Ito green `#009E73` / vermillion
`#D55E00` pair (CVD-distinguishable) **and** retain the ✓/✗ gutter icons as a
redundant non-color channel — so pass/fail never relies on hue alone. The two
semantic highlights (teal band, brown/tan chip) separate from the two run washes
by **lightness and the cool/warm axis**, not just hue, so they remain distinct
under all three CVD types.

### Syntax tokens (earthy, mode-aware)

Replace `basicSetup`'s default syntax colors with a custom `HighlightStyle`
whose colors are `var(--syn-*)` CSS vars, defined per mode in `global.css`:

| Token | tag(s) | light | dark |
|---|---|---|---|
| `--syn-keyword` | `keyword`, `modifier`, `operatorKeyword` | `#9A3E1B` | `#E08A57` |
| `--syn-string` | `string`, `special(string)` | `#5E7A4E` | `#9CBE82` |
| `--syn-comment` | `comment`, `lineComment`, `blockComment` | `#A08C72` | `#7C6E58` |
| `--syn-function` | `function(variableName)`, `definition` | `#7A5C2E` | `#D4A24C` |
| `--syn-number` | `number`, `bool`, `atom` | `#8A5A2B` | `#D38B4E` |
| `--syn-heading` | `heading` (markdown) | `#3B2E20` bold | `#EFE7D7` bold |
| `--syn-meta` | `meta`, `punctuation`, `bracket` | `#8A7B66` | `#94866F` |

Exact hues are a starting point; verify legibility in preview (both themes).

## Editor capsule (step + param)

A matched step and its parameter render as **one capsule**: the matched words
(teal `--ed-step-bg`) flow straight into the param chip (`--ed-chip-bg`), the
connecting whitespace is filled, and only the two **outer** corners are rounded
(the teal→brown seam is square).

**Why a transform is needed:** the LSP emits a `function` token range for the
matched literal and a separate `parameter` token range, with the inter-token
**space left undecorated** — so the two `cm-token-*` spans are not DOM-adjacent
and a gap shows. The fix is a **pure transform** over the decoded token list
(in the website's editor layer, not the generic `cm-semantic-tokens.ts` core
contract and not `@oselvar/var`): when a `function` token is immediately
followed by a `parameter` token separated only by whitespace, **extend the
`function` token's end to the `parameter` token's start**. The two spans then
render adjacent; CSS rounds the outer corners:

```css
.cm-token-function { background: var(--ed-step-bg); color: var(--ed-step-text); border-radius: 4px; padding: 1px 0 1px 4px; }
.cm-token-parameter { background: var(--ed-chip-bg); color: var(--ed-chip-text); border-radius: 4px; padding: 1px 5px; font-weight: 600; }
/* capsule: square the interior seam when function is immediately followed by a param */
.cm-token-function:has(+ .cm-token-parameter) { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.cm-token-function + .cm-token-parameter { border-top-left-radius: 0; border-bottom-left-radius: 0; }
```

A matched step with **no** following parameter keeps both ends rounded.

## Files to change

| File | Change |
|---|---|
| `src/styles/global.css` | Invert the token bridge: define earthy `--ax-*` overrides under `:root,.light` and `.dark`; add `--ed-*` and `--syn-*` tokens per mode; retune `--var-accent*`; repoint legacy vars. |
| `src/lib/var-token-theme.ts` | Step: underline → `--ed-step-bg` background capsule (left-rounded via CSS). Param: `--ed-chip-bg`/`--ed-chip-text` (fixes navy-on-navy), right-rounded. |
| `src/lib/cm-semantic-tokens.ts` *(or a small new `src/lib/var-capsule-tokens.ts`)* | Pure transform joining `function`→`parameter` ranges through whitespace, with a unit test. Keep the generic extension's server-agnostic contract intact (apply the transform in the website wiring or behind an opt-in option). |
| `src/lib/cm-run.ts` | `.cm-run-pass`/`.cm-run-fail` → `--ed-pass-bg`/`--ed-fail-bg`; `.cm-run-passmark`/`.cm-run-errmark` → `--ed-pass-mark`/`--ed-fail-mark`; dialog/stack/backdrop onto earthy tokens. |
| `src/lib/cm-generate-step.ts` | Flash + stepgen button onto earthy tokens (`--var-accent`/`--ed-*`), not pink/yellow. |
| `src/scripts/editor-mount.ts` (+ new `src/lib/cm-var-theme.ts`) | Add a custom `EditorView.theme` (editor bg/text/gutter/selection/cursor via `--ed-*`) and a custom `HighlightStyle` (via `--syn-*`); wire into the extension list. |
| `src/components/FileEditor.astro` | Align the static docs code-window: `.fe-step` → teal background capsule, `.fe-param` → readable chip, traffic-light dots + title bar onto earthy vars (no `#ffd60a`). |

## Out of scope

- No new Aksel React components.
- No content/copy changes; `your-docs-are-your-source.md` (user WIP) untouched.
- Square corners already shipped (commit `d0eaf48`) — unchanged here.

## Testing

- **Unit:** the function→parameter join transform (pure) gets a vitest test —
  contiguous output, whitespace absorbed, no-param case unchanged, multiple
  steps per line.
- **Build:** `pnpm --filter @oselvar/website build` green; verify earthy
  `--ax-*` overrides win in the bundled CSS (ours after Aksel's).
- **Manual (both themes):** front page, `/docs/`, a doc page, and `/playground`
  in light and warm-dark — confirm: readable param chips, teal step capsule with
  outer-only rounding, green/vermillion pass/fail with ✓/✗, no leftover
  blue/navy or `#ffd60a`, links sienna/terracotta, buttons brown/terracotta.
- **CVD:** spot-check the editor through a deuteranopia simulator; ✓/✗ legible,
  step capsule distinct from washes.
