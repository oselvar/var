# Starlight website scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a second, Starlight-based docs site (`packages/website-starlight`) in the `typescript/` pnpm workspace, styled with the existing earthy palette, with zero content migrated — the first sub-project of a strangler-fig migration off the hand-built `@oselvar/website` package.

**Architecture:** Scaffold via Starlight's own `create-astro` template (not manual `@astrojs/starlight` wiring into a blank project). Style via Starlight's own theming variables (`--sl-color-*`, `--sl-font`) in a `customCss` file — not a re-creation of the old site's Aksel-token-bridge architecture, and not a pre-built theme from Starlight's community gallery.

**Tech Stack:** Astro 7, `@astrojs/starlight` 0.41.x, pnpm workspace (`typescript/`), `@fontsource-variable/source-sans-3`.

## Global Constraints

- **No content migration.** Only Starlight's own template placeholder content. Nothing imported from `@oselvar/website/src/content`.
- **No live editor, no Search/Sidebar/Breadcrumb port, no blog, no cutover.** All deferred to later sub-projects (see spec).
- **No pre-built Starlight theme** (Rapide/Obsidian/Catppuccin/etc.) and **no `@astrojs/starlight-tailwind`.** Palette is our own, via `customCss`.
- Package: `typescript/packages/website-starlight`, name `@oselvar/website-starlight`, `"version": "0.0.0"`, `"private": true` — matches `@oselvar/website`'s conventions exactly.
- Every task ends green: `pnpm --filter @oselvar/website-starlight build` (from `typescript/`) exits 0. Final task additionally requires `pnpm check` (lint + typecheck + test + knip + jscpd) green, matching this repo's standard done-bar.
- Commit after each task.

**Spec:** `docs/superpowers/specs/2026-07-01-website-starlight-scaffold-design.md`

---

## Verified facts this plan relies on

- `npx create-astro@latest packages/website-starlight --template starlight --no-install --no-git --no-ai --yes` (run from `typescript/`) scaffolds a working Starlight project with `@astrojs/starlight@^0.41.1` / `astro@^7.0.2` — confirmed compatible with this workspace's existing `astro@^7.0.3` (no version conflict), no interactive prompts, no nested git repo, no AI agent files.
- The scaffold's `package.json` starts as `{"name": "starlight-test", "version": "0.0.1", ...}` — must be edited to the workspace naming convention.
- Freshly scaffolded file tree: `astro.config.mjs`, `package.json`, `tsconfig.json`, `.gitignore`, `.vscode/`, `public/favicon.svg`, `src/assets/houston.webp`, `src/content.config.ts`, `src/content/docs/index.mdx`, `src/content/docs/guides/example.md`, `src/content/docs/reference/example.md`.
- `pnpm install` from `typescript/` picks up the new workspace member cleanly (verified: "Scope: all N workspace projects", no `ERR_PNPM_IGNORED_BUILDS`, no new peer-dependency warnings beyond the pre-existing unrelated `astro-pagefind` one on `packages/website`).
- `pnpm --filter @oselvar/website-starlight build` succeeds standalone, producing `dist/` with 4 pages plus an optimized `houston.webp` (confirms `sharp`, pulled in transitively by Starlight for image optimization, works fine in this environment).
- Compiled CSS lands in a content-hashed file matching `dist/_astro/common.*.css` (filename hash changes per build — always glob it, never hardcode the hash).
- Confirmed Starlight CSS variable names actually present in that compiled CSS: `--sl-color-accent-low`, `--sl-color-accent`, `--sl-color-accent-high`, `--sl-color-black`, `--sl-color-white`, `--sl-color-gray-1` through `--sl-color-gray-7`, `--sl-color-bg` (derived internally as `var(--sl-color-black)` — we don't set it directly), `--sl-font`.
- Font stack used site-wide today (`packages/website/src/styles/global.css:10`): `'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif`.
- `pnpm check` (root) passed with the scaffolded package present, *after* one `biome` auto-fix pass on the 3 generated files that used double quotes/semicolons/unsorted imports (`astro.config.mjs`, `content.config.ts`) — no `knip.json`/`.jscpd.json` changes were needed; knip's only output was pre-existing configuration hints unrelated to the new package, and jscpd found 0 clones.

## Earthy palette source values (from `docs/superpowers/specs/2026-06-26-earthy-color-scheme-design.md`)

| Role | Light | Dark (warm-dark) |
|---|---|---|
| bg-default | `#F4F0E6` | `#17120D` |
| bg-raised | `#FBF8F0` | `#221A12` |
| bg-sunken | `#ECE5D5` | `#110D09` |
| text-default | `#2A2017` | `#EFE7D7` |
| text-subtle (faint) | `#8A7B66` | `#94866F` |
| border-subtle | `#DCD3C0` | `#3A2E22` |
| border-default | `#C8BBA3` | `#6A523B` |
| accent | `#B0552F` | `#CC6B3C` |
| accent-strong (secondary/high accent) | `#C8924A` | `#D9A441` |

---

## File Structure

`typescript/packages/website-starlight/`:
- `package.json` — scaffolded, then edited (name/version/private)
- `astro.config.mjs` — scaffolded, then edited (add `customCss`)
- `src/styles/custom.css` — **new**, the earthy `--sl-color-*`/`--sl-font` overrides
- Everything else (`tsconfig.json`, `src/content.config.ts`, `src/content/docs/**`, `public/`) — untouched scaffold defaults

No other package in the workspace is modified.

---

## Task 1: Scaffold and wire `website-starlight` into the workspace

**Files:**
- Create: `typescript/packages/website-starlight/` (entire scaffolded tree, via `create-astro`)
- Modify: `typescript/packages/website-starlight/package.json` (name, version, private)

**Interfaces:**
- Produces: a workspace package `@oselvar/website-starlight` with a working `build`/`dev`/`preview` script set, buildable both standalone (`pnpm --filter`) and as part of `pnpm -r build`.

- [ ] **Step 1: Scaffold the project**

From `typescript/`:

```bash
npx create-astro@latest packages/website-starlight --template starlight --no-install --no-git --no-ai --yes
```

Expected: prints "Project initialized!" and creates `packages/website-starlight/` with the file tree listed above. No prompts, no `.git` directory inside it.

- [ ] **Step 2: Rename the package**

Edit `packages/website-starlight/package.json`. Change:

```json
  "name": "starlight-test",
  "type": "module",
  "version": "0.0.1",
```

to:

```json
  "name": "@oselvar/website-starlight",
  "version": "0.0.0",
  "private": true,
  "type": "module",
```

(Keep the rest of the file — `scripts` and `dependencies` — as scaffolded.)

- [ ] **Step 3: Install and verify the workspace picks it up**

From `typescript/`:

```bash
pnpm install
```

Expected: output includes `Scope: all N workspace projects` (one more than before), no `ERR_PNPM_IGNORED_BUILDS`, no new peer-dependency warnings (the pre-existing `astro-pagefind` peer warning on `packages/website` is unrelated and expected).

- [ ] **Step 4: Verify the package builds standalone**

```bash
pnpm --filter @oselvar/website-starlight build
```

Expected: exit 0, ends with `[build] Complete!`, `packages/website-starlight/dist/` contains `index.html`, `guides/example/index.html`, `reference/example/index.html`.

- [ ] **Step 5: Verify the whole workspace still builds**

```bash
pnpm -r build
```

Expected: exit 0, every package (including `@oselvar/website-starlight`) reports success.

- [ ] **Step 6: Fix formatting/lint on the generated files**

The scaffold's `astro.config.mjs` and `src/content.config.ts` use double quotes, semicolons, and unsorted imports, which this repo's biome config rejects. Auto-fix, from `typescript/`:

```bash
pnpm exec biome check --write packages/website-starlight
```

Expected: reports files fixed (import sort + quote/semicolon style).

- [ ] **Step 7: Run the full check gate**

From `typescript/`:

```bash
pnpm check
```

Expected: exit 0 — lint, typecheck, vitest (460+ tests), knip, and jscpd all pass. Knip may print pre-existing "Configuration hints" (informational, not failures) unrelated to this package; those are fine as-is. If knip or jscpd *do* newly flag something in `packages/website-starlight` as an error (not a hint), add a targeted entry to `typescript/knip.json`'s `ignore` array (following the existing pattern for `packages/website/src/layouts/Doc.astro`) rather than restructuring the scaffold.

- [ ] **Step 8: Commit**

```bash
git add typescript/packages/website-starlight typescript/pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(website-starlight): scaffold Starlight docs site

Sub-project 1 of the strangler-fig migration off the hand-built
website package (docs/superpowers/specs/2026-07-01-website-starlight-scaffold-design.md).
Bare Starlight template, no content migrated, coexists unlinked and
undeployed alongside @oselvar/website.
EOF
)"
```

---

## Task 2: Apply the earthy palette

**Files:**
- Create: `typescript/packages/website-starlight/src/styles/custom.css`
- Modify: `typescript/packages/website-starlight/astro.config.mjs`

**Interfaces:**
- Consumes: the package scaffolded in Task 1.
- Produces: a `custom.css` wired into the Starlight integration's `customCss` array; later tasks (and future sub-projects) can add further overrides to the same file.

- [ ] **Step 1: Write the palette CSS**

Create `packages/website-starlight/src/styles/custom.css`:

```css
/*
 * Vár earthy palette, ported from
 * docs/superpowers/specs/2026-06-26-earthy-color-scheme-design.md
 * onto Starlight's own theming variables. Dark is the default `:root`
 * (Starlight's convention); light overrides live under
 * `:root[data-theme='light']`. accent-low is a derived subtle wash in
 * both themes (no direct earthy-doc equivalent) — the only two values
 * here not taken verbatim from the design doc; revisit visually if the
 * wash reads wrong.
 */

:root {
  --sl-color-black: #110d09;
  --sl-color-gray-1: #17120d;
  --sl-color-gray-2: #221a12;
  --sl-color-gray-3: #3a2e22;
  --sl-color-gray-4: #6a523b;
  --sl-color-gray-5: #94866f;
  --sl-color-gray-6: #b7a892;
  --sl-color-gray-7: #efe7d7;
  --sl-color-white: #efe7d7;

  --sl-color-accent-low: #3a2418;
  --sl-color-accent: #cc6b3c;
  --sl-color-accent-high: #d9a441;
}

:root[data-theme='light'] {
  --sl-color-black: #f4f0e6;
  --sl-color-gray-1: #fbf8f0;
  --sl-color-gray-2: #ece5d5;
  --sl-color-gray-3: #dcd3c0;
  --sl-color-gray-4: #c8bba3;
  --sl-color-gray-5: #8a7b66;
  --sl-color-gray-6: #6b5d4c;
  --sl-color-gray-7: #2a2017;
  --sl-color-white: #2a2017;

  --sl-color-accent-low: #efd9c9;
  --sl-color-accent: #b0552f;
  --sl-color-accent-high: #c8924a;
}
```

- [ ] **Step 2: Wire it into the Starlight integration**

Edit `packages/website-starlight/astro.config.mjs` — add `customCss` to the `starlight({...})` config object:

```js
starlight({
  title: 'My Docs',
  customCss: ['./src/styles/custom.css'],
  social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
  sidebar: [
    // ...unchanged
  ],
}),
```

- [ ] **Step 3: Build and verify the palette compiled in**

```bash
pnpm --filter @oselvar/website-starlight build
grep -l -- '--sl-color-accent:#cc6b3c' packages/website-starlight/dist/_astro/*.css
```

Expected: `grep` prints a matching filename (confirms the dark-theme accent value made it into the compiled CSS). Repeat for the light value as a second check:

```bash
grep -l -- '--sl-color-accent:#b0552f' packages/website-starlight/dist/_astro/*.css
```

- [ ] **Step 4: Manual visual check**

```bash
pnpm --filter @oselvar/website-starlight dev
```

Open the printed local URL. Confirm: page background and accent color read as the earthy palette (deep brown/terracotta, not Starlight's default blue), in both the default (dark) view and after toggling to light via Starlight's built-in theme switcher (top-right of the page). Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 5: Commit**

```bash
git add typescript/packages/website-starlight
git commit -m "$(cat <<'EOF'
feat(website-starlight): port earthy palette onto Starlight theme vars

Maps the design-doc's light/warm-dark hex values directly onto
Starlight's --sl-color-* primitives via customCss, per
2026-07-01-website-starlight-scaffold-design.md. Two accent-low wash
values are derived (no direct doc equivalent) and flagged for visual
tuning later.
EOF
)"
```

---

## Task 3: Add the Vár font and confirm done criteria

**Files:**
- Modify: `typescript/packages/website-starlight/package.json` (add dependency)
- Modify: `typescript/packages/website-starlight/src/styles/custom.css` (add `--sl-font`)

**Interfaces:**
- Consumes: `custom.css` from Task 2.
- Produces: the fully-styled scaffold this sub-project is done criteria for.

- [ ] **Step 1: Add the font package**

From `typescript/`:

```bash
pnpm --filter @oselvar/website-starlight add @fontsource-variable/source-sans-3
```

Expected: adds `@fontsource-variable/source-sans-3` to `packages/website-starlight/package.json` `dependencies`, updates `pnpm-lock.yaml`.

- [ ] **Step 2: Import the font**

Add to the top of `packages/website-starlight/src/styles/custom.css` (before the `:root` blocks):

```css
@import '@fontsource-variable/source-sans-3';
```

- [ ] **Step 3: Set `--sl-font`**

Add to both the `:root` block and the `:root[data-theme='light']` block in `custom.css` (same value both themes — font doesn't change with color scheme):

```css
:root {
  --sl-font: 'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif;
  /* ...existing overrides... */
}
```

```css
:root[data-theme='light'] {
  --sl-font: 'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif;
  /* ...existing overrides... */
}
```

- [ ] **Step 4: Build and verify the font compiled in**

```bash
pnpm --filter @oselvar/website-starlight build
grep -l "Source Sans 3 Variable" packages/website-starlight/dist/_astro/*.css
```

Expected: `grep` prints a matching filename.

- [ ] **Step 5: Manual side-by-side check (this sub-project's done criteria)**

```bash
pnpm --filter @oselvar/website-starlight dev
```

In a second terminal:

```bash
pnpm --filter @oselvar/website dev
```

Open both local URLs side by side, light and dark. Confirm the Starlight scaffold visibly reads as *this* site — same palette, same font — rather than Starlight's stock theme. Stop both dev servers when done.

- [ ] **Step 6: Full check gate, repo-wide**

From `typescript/`:

```bash
pnpm -r build
pnpm check
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add typescript/packages/website-starlight typescript/pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(website-starlight): add Vár's font, complete scaffold sub-project

Source Sans 3 Variable via --sl-font, matching packages/website's
font stack exactly. Closes out sub-project 1 of the Starlight
migration (scaffold + palette + font); content, live editor, search/
sidebar, blog, and cutover are separate follow-up sub-projects.
EOF
)"
```
