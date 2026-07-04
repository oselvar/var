# Named themes: Jord (existing) and Fjord (new teal)

Date: 2026-07-02
Status: approved

> Update (2026-07-02): two more palettes added via the same mechanism —
> **Ild** (red/orange, `themes/ild.css`) and **Fjeld** (white/black/green,
> `themes/fjeld.css`). Each is one CSS file plus one selector option, as
> designed.

## Goal

Add a second color theme to the Starlight website without changing the existing
brownish one, selectable from a control next to the dark-mode select. Themes get
names: **Jord** (the current earthy palette, Norse for "earth") and **Fjord**
(the new teal palette).

## Mechanism

A `data-palette` attribute on `<html>`, orthogonal to Starlight's `data-theme`
(dark/light). Absent or `jord` → the existing CSS applies untouched.

- `src/styles/themes/fjord.css` (new, registered in `customCss` after
  `custom.css`) defines two blocks:
  - `:root[data-palette='fjord']` — dark Fjord: cold blue-green background
    ramp, teal accent (`#2fa79c`), cool off-white text.
  - `:root[data-palette='fjord'][data-theme='light']` — light Fjord: pale
    glacier background, deep teal accent (`#157a72`).
  Each block re-points every variable group `custom.css` defines: Starlight
  `--sl-color-*`, legacy editor names (`--surface`, `--accent`, ...), `--ed-*`
  editor tokens, `--syn-*` syntax colors. The Okabe-Ito pass/fail colors stay
  identical (they are semantic, color-blind-safe).
- Cascade: fjord.css loads after custom.css, so its dark block (0-2-0) beats
  `:root`, and its light block (0-3-0) beats `:root[data-theme='light']`. The
  light block re-declares every variable the dark block declares, so the
  same-specificity overlap between fjord-dark and jord-light is harmless.

## Selector

Override Starlight's `ThemeSelect` component (`components.ThemeSelect` in
`astro.config.mjs`). The override renders a palette `<select>` (options Jord /
Fjord, `pencil` icon) built from Starlight's own `Select.astro`, then the
built-in ThemeSelect — the two dropdowns sit side by side in the header and the
mobile menu. A `<var-palette-select>` custom element applies changes to
`document.documentElement.dataset.palette`, persists to `localStorage` under
`var-palette`, and syncs all select instances.

## No flash of wrong palette

An inline script in the Starlight `head` config sets `data-palette` from
`localStorage` before first paint (only when the stored value is `fjord`; Jord
needs no attribute). Default with nothing stored: Jord.

## Verification

`pnpm --filter @oselvar/website build` plus dev-server screenshots of
all four combinations (Jord/Fjord × dark/light) including the live editor.
