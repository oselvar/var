# Starlight website scaffold — Design

**Date:** 2026-07-01
**Status:** Approved (brainstorm complete)
**Area:** new package `packages/website`

## Goal

Stand up a second, Starlight-based docs site in the `typescript/` pnpm
workspace, styled to match the existing earthy palette, with no content
migrated yet. This is sub-project 1 of a strangler-fig migration away from the
hand-built `@oselvar/website` package: the two sites coexist, undeployed and
unwired to each other, until later sub-projects port the interactive editor,
decide what to do about search/sidebar/blog, rewrite the docs content against
Starlight's own content schema, and finally cut over.

## Why Starlight, why now

The immediate trigger was a tabs feature (language/runner selection for
TypeScript vs. Python examples): Starlight ships `Tabs`/`TabItem` with
`syncKey`-based cross-group sync and localStorage persistence out of the box —
exactly what would otherwise have to be hand-built and maintained. Rather than
reproduce a subset of a docs framework by hand indefinitely, adopt the
framework and get tabs (and its other built-in docs affordances) for free.

## Non-goals for this sub-project

- **No content migration.** `guides/`, `concepts/`, `reference/`, `start-here/`,
  and the blog stay on `@oselvar/website`, untouched. The new site starts from
  Starlight's own template placeholder page(s); real content is rewritten from
  scratch later, directly against Starlight's `docsLoader`/`docsSchema`.
- **No live editor.** The CodeMirror/LSP-driven interactive playground
  (`Editor.astro`, `editor-mount.ts`, `cm-*.ts`, `@oselvar/var-lsp` wiring) is
  the site's most bespoke feature and is deliberately deferred to its own
  sub-project once the shell exists to receive it.
- **No Search/DocsSidebar/Breadcrumb/MoreInArea port.** Starlight has built-in
  equivalents (search via Pagefind, an auto-generated sidebar, a theme
  switcher). Whether to keep Starlight's defaults or replace them with
  ports of the current custom components is a decision for a later
  sub-project, once there's real content to navigate.
- **No blog.** Starlight has no blog primitive; how (or whether) the blog
  continues is out of scope here.
- **No cutover.** No `base`/`site` config pointed at the real domain, no CI/
  deploy wiring, no redirects, no retiring `@oselvar/website`. This package
  simply builds and previews locally alongside the existing one.

## Package setup

- New workspace package: `typescript/packages/website`
  (`@oselvar/website`), matched automatically by the existing
  `packages/*` entry in `pnpm-workspace.yaml` — no workspace config changes
  needed.
- Scaffolded via Starlight's own starter template
  (`pnpm create astro@latest -- --template starlight`), not by manually
  wiring `@astrojs/starlight` into a blank Astro project — less to get wrong
  for a brand-new package, and it's the officially supported path.
- `output: 'static'`, matching `@oselvar/website`'s deployment model, but with
  no `site`/`base` set to a real path yet (it isn't deployed).
- `pnpm -r build` must pick it up and stay green, like every other package in
  the workspace — it just isn't linked from anywhere public yet.

## Content

Only Starlight's own default template content (a landing/index page and
whatever `docs/` placeholder the template scaffolds). Nothing is imported from
`@oselvar/website/src/content`.

## Styling port

We build our own Vár theme rather than installing one of the pre-built
community themes from Starlight's [themes gallery](https://starlight.astro.build/resources/themes/)
(e.g. Rapide, Obsidian, Catppuccin) — those bundle someone else's CSS,
components, and opinions as a single package; we want our own palette and
only the component overrides we actually decide we need. Two official,
documented mechanisms, no forking of Starlight internals:

1. **[CSS & Tailwind guide](https://starlight.astro.build/guides/css-and-tailwind/)**
   for the palette. Port the **earthy palette** (from
   `2026-06-26-earthy-color-scheme-design.md`) as hex values, mapped directly
   onto Starlight's own theming variables — not by recreating the
   Aksel-token-bridge architecture (`--ax-*`), which was always an internal
   implementation detail of the hand-built site, not something Starlight
   needs.
   - A `src/styles/custom.css` wired in via Starlight's `customCss` config
     array, overriding (verify exact names against the installed Starlight
     version's `props.css` during implementation — these are the expected
     ones):
     - `--sl-color-accent*` (accent scale) ← terracotta/sienna accent
       (`#B0552F` light / `#CC6B3C` dark)
     - `--sl-color-gray-*`, `--sl-color-bg*`, `--sl-color-text*` ← linen/umber
       light (`#F4F0E6` bg / `#2A2017` text) and warm-dark
       (`#17120D` bg / `#EFE7D7` text) scales
     - `--sl-font` ← `@fontsource-variable/source-sans-3` (same font as today)
   - Starlight ships light/dark switching natively — no custom `ThemeToggle`
     port needed for this step.
   - **Superseded:** the scaffold originally skipped `@astrojs/starlight-tailwind`
     (the old site's Tailwind v4 usage served the Aksel token bridge, not
     utility classes central to the look, so it seemed avoidable). Porting
     `Editor.astro` in the live-editor sub-project needs it after all — that
     component's markup is Tailwind-utility-class-driven. Added via
     Starlight's own retrofit path (`astro add tailwind` +
     `@astrojs/starlight-tailwind`, a `tailwind.css` entry loaded *first* in
     `customCss` so our earthy `custom.css` still wins the cascade) rather
     than reopening the "no pre-built theme" decision above — same
     no-forking spirit, just an additional official mechanism in play.
2. **[Overriding components guide](https://starlight.astro.build/guides/overriding-components/)**
   for anything CSS can't reach. This sub-project doesn't need any component
   overrides yet — the default template shell is enough to prove the
   palette. But when a later sub-project *does* want to replace a built-in
   (sidebar, page frame, social icons, …), the pattern is set now: register
   it in `starlight()`'s `components` config and, where we want to keep most
   of Starlight's own markup, import and render its `Default` export inside
   ours — never a copy-pasted fork of Starlight's internals.

No syntax-highlighting or editor-capsule token work here — that's entirely
inside the deferred live-editor sub-project.

## Done criteria

- `pnpm -r build` passes with the new package included.
- `pnpm --filter @oselvar/website dev` renders a Starlight shell
  that visibly reads as *this* site — earthy palette, correct font, working
  light/dark toggle — rather than Starlight's default blue theme.

## Testing

- Build: `pnpm -r build` exit 0.
- Manual: preview the scaffold in a browser, light and dark, confirm palette
  and font match the existing site's identity (side-by-side with
  `@oselvar/website` is the easiest check, not a pixel-diff).

## Follow-up sub-projects (not this one)

1. Port the live CodeMirror/LSP editor island.
2. Decide on Search/Sidebar/Breadcrumb: Starlight defaults vs. custom ports.
3. Decide on the blog.
4. Rewrite real docs content against Starlight's schema.
5. Introduce the language/runner `Tabs` usage the whole migration was
   triggered by.
6. Cutover: deploy config, redirects, retire `@oselvar/website`.
