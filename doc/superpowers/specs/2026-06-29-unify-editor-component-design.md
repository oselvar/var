# Unify on `Editor.astro`, retire `FileEditor.astro`

**Date:** 2026-06-29
**Status:** Approved

## Problem

The website has two editor components that grew up at different times:

- **`FileEditor.astro`** (189 lines) — a *static, server-rendered code window*. It
  renders a titlebar (traffic-light dots + filename with a coloured extension), a
  line-number gutter, and **static** step/param highlighting computed at build time
  via `highlightSteps` from `lib/step-highlight.ts`. Zero client JS. Used in three
  docs/tutorial MDX pages: `start-here/hello-var-your-first-spec.mdx`,
  `reference/step-arguments.mdx`, `reference/tables.mdx`.
- **`Editor.astro`** (41 lines) — a *live CodeMirror mount* (`.cm-mount`, hydrated by
  `scripts/editor-mount.ts`): folding, semantic tokens via a shared LSP worker,
  auto-run-on-change with result painting, and the "define step" affordance. Editable
  and runnable. Used in `pages/index.astro` and `pages/playground.astro`.

They are not duplicates — they are different tools. The decision is to consolidate on
the live `Editor` and make the doc samples live, editable, and runnable, so there is a
single source of truth for "show a `.var.md`/`.steps.ts` in the browser".

## Decisions (from brainstorming)

1. **Doc samples become live & editable** full CodeMirror instances (not static, not
   read-only).
2. **Window chrome is optional via a prop** on `Editor` — docs opt in to the filename
   titlebar; index/playground stay bare.
3. **Steps source is per-doc, author's choice** — a sample can carry its `.steps.ts`
   hidden (only the spec is visible, as today) *or* render a second visible `Editor`.
4. **Run scope is a group attribute** — each spec runs only against the step files in
   its own group, replacing the current "first `.var.md` vs all `.steps.ts` on the
   page" model.

## Design

### `Editor.astro` — new props

Existing props (`uri`, `lang`, `lineNumbers`, `folding`, `define`) are unchanged. Add:

- **`filename?: string`** — when set, wrap the `.cm-mount` in the window chrome
  (titlebar + traffic-light dots + `name`/coloured-`ext`). FileEditor's `.fe-*` CSS
  moves into `Editor.astro`, scoped. When absent, the current bare bordered look.
- **`group?: string`** — emitted as `data-group`. Editors sharing a group run
  together. When absent, a single per-page default group, which preserves
  index/playground behaviour (one `.var.md` + its `.steps.ts`).
- **`steps?: ReadonlyArray<{ path: string; source: string }>`** — hidden companion
  step sources for this editor's run group, serialized into the mount (e.g. a
  `data-steps` JSON attribute). They feed the live run without rendering a visible
  editor. Authors who want the steps visible instead render a second
  `<Editor lang="typescript">` in the same group.

`decodeEntities` (from `step-highlight.ts`) is still used to recover the raw slot text.

### Run model — `scripts/editor-mount.ts`

Today there is one module-level `views` map and `runSpecNow` grabs the *first*
`.var.md` view plus *all* `.steps.ts` views on the page. Change to **group-scoped**:

- Read `data-group` per mount; default to a single shared group id when absent.
- Track views per group (group → uri → `EditorView`), plus hidden carried step
  sources parsed from each mount's `data-steps`, registered into that mount's group.
- `runSpecNow(group)` resolves that group's `.var.md` view, gathers step files from
  the group's visible `.steps.ts` views **plus** its hidden carried step sources,
  runs, and paints results into the group's markdown view.
- `autoRun` / `scheduleRun` are scoped per group: a change in one group only re-runs
  that group.
- A group with no `.var.md` (e.g. the plain `hello.md` sample) simply never runs.
- One shared LSP worker (`sharedClient`) still serves the whole page — grouping does
  not increase worker count.

### Migration

- **3 MDX files** — replace `import FileEditor` with `import Editor`; rewrite each
  `<FileEditor filename steps>` as
  `<Editor uri="file:///<name>" lang="markdown" filename="<name>" steps={…} group="<unique>">`.
  Each runnable sample gets its **own group** so multiple samples on one page do not
  cross-run. The plain-markdown `hello.md` sample (no steps) becomes
  `<Editor uri="file:///hello.md" lang="markdown" filename="hello.md" define={false} />`
  — no group/steps, so it never runs. Steps stay **hidden** (doc layout unchanged,
  just now live and runnable).
- **index.astro / playground.astro** — no functional change required (default group);
  left as-is.

### Dead-code removal

- Delete `components/FileEditor.astro`.
- Delete `highlightSteps` (and its private helpers `shrinkRange`, `coalesce`, the
  `Segment`/`HighlightedLine`/`SegmentKind` types if unused elsewhere) from
  `lib/step-highlight.ts`. **Keep `decodeEntities`** — `Editor.astro` imports it.
  Trim `lib/step-highlight.test.ts` to the `decodeEntities` cases. Confirm no other
  consumers with `knip`.
- `components/CopyButton.astro` — remove the `if (pre.closest('.file-editor')) continue`
  skip and fix the comments. Verify CodeMirror's contenteditable `div` is not matched
  by the `.doc-body pre:not([data-copy])` selector; if it is, skip `.cm-mount` instead.
- `styles/global.css` (line ~13) — drop the FileEditor mention from the legacy-brand
  comment. The CSS vars (`--ink`, `--cream`, `--yellow`, …) stay; the CodeMirror theme
  files still use them.

## Risks & verification

- **Run-model regression** — index/playground must still run under the default group.
- **Doc correctness** — the 3 doc pages must render the chrome, be editable, and show
  pass/fail with their hidden steps.
- **CopyButton** — must not attach a copy button to live editors.

Gates (per CLAUDE.md):

- `pnpm -r build` (type-checks each package's `src/`).
- `pnpm typecheck` (type-checks tests).
- `pnpm --filter @oselvar/website build` (Astro build).
- vitest for the trimmed `step-highlight.test.ts`.
- `knip` to confirm `highlightSteps` is fully dead.
- Visual pass on the 3 doc pages + index + playground.

## Out of scope

- No read-only editor mode (samples are fully live & editable).
- No changes to the LSP worker, semantic-token pipeline, or run-result format.
- No new doc content — only the editor component the docs use.
