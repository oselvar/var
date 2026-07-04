# FileEditor Step Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight matched step sentences (underline) and captured parameters (hot-pink chips) inside the website's `FileEditor`, reusing the Vár matching engine at build time, with no LSP dependency and no client-side JavaScript.

**Architecture:** The website depends on `@oselvar/var-language` and calls `buildWorkspaceIndex({ stepFiles, varFiles })` during `astro build`. A pure helper turns the returned matches into per-line render segments. `FileEditor.astro` (slot-based body, MDX) renders those segments when given a `steps` prop; otherwise it renders plainly as today.

**Tech Stack:** Astro 5 (static output, MDX), `@oselvar/var-language` (→ `@oselvar/var` + `typescript`), vitest.

## Global Constraints

- **No `@oselvar/var-lsp` dependency.** Use `@oselvar/var-language` only (the LSP consumes it, not the reverse).
- **Build-time only / prerendered.** No client JS is added; the page stays static HTML+CSS.
- **`var-language` `Range`s are 1-based** (line and character), end-exclusive. Convert to 0-based with `-1` when mapping to rendered lines.
- **`{string}` param spans cover inner content only** (the surrounding quotes belong to the enclosing step span) — do not special-case this; just render whatever spans come back.
- **Palette:** cream `--cream`, ink `--ink`, hot-pink `--accent`, yellow `--yellow`, orange `--orange` (already defined in `global.css`).
- **Segment invariant:** for every source line, the concatenation of its segment `text`s must equal the original line exactly (no characters added or lost).

---

### Task 1: Pure highlight helper + unit tests

**Files:**
- Modify: `packages/website/package.json` (add dependency)
- Create: `packages/website/src/lib/step-highlight.ts`
- Create: `packages/website/src/lib/step-highlight.test.ts`
- Create: `packages/website/vitest.config.ts`

**Interfaces:**
- Produces:
  - `highlightSteps(input: { varPath: string; source: string; steps: ReadonlyArray<{ path: string; source: string }> }): ReadonlyArray<HighlightedLine>`
  - `decodeEntities(s: string): string`
  - types `SegmentKind = 'plain' | 'step' | 'param'`, `Segment = { text: string; kind: SegmentKind }`, `HighlightedLine = ReadonlyArray<Segment>`
- Consumes: `buildWorkspaceIndex` from `@oselvar/var-language`.

- [ ] **Step 1: Add the workspace dependency**

Edit `packages/website/package.json` — add `@oselvar/var-language` to `dependencies` (keep `@astrojs/mdx`):

```json
  "dependencies": {
    "@astrojs/mdx": "^4",
    "@oselvar/var-language": "workspace:*"
  },
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes; `@oselvar/var-language` linked into the website.

- [ ] **Step 3: Add a vitest config for the website** (so the root workspace picks up the test)

Create `packages/website/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Write the failing test**

Create `packages/website/src/lib/step-highlight.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeEntities, highlightSteps } from './step-highlight.js'

const STEP_SOURCE = `import { defineContext } from '@oselvar/var-vitest'
const { step } = defineContext(() => ({ greeting: '' }))
step('I greet {string}', (ctx, name: string) => {})
step('the greeting should be {string}', (ctx, expected: string) => {})
`

const steps = [{ path: '01-hello.steps.ts', source: STEP_SOURCE }]

function lineText(line: ReadonlyArray<{ text: string }>): string {
  return line.map((s) => s.text).join('')
}

describe('highlightSteps', () => {
  it('preserves every line verbatim across segments', () => {
    const source = '# Hi\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n'
    const lines = highlightSteps({ varPath: 'hello.var.md', source, steps })
    const original = source.split('\n')
    expect(lines.length).toBe(original.length)
    lines.forEach((line, i) => expect(lineText(line)).toBe(original[i]))
  })

  it('marks captured parameters as param segments', () => {
    const source = 'First I greet "world" okay? I think the greeting should be "Hello, world!"'
    const [line] = highlightSteps({ varPath: 'hello.var.md', source, steps })
    const params = line.filter((s) => s.kind === 'param').map((s) => s.text)
    expect(params).toContain('world')
    expect(params).toContain('Hello, world!')
    expect(line.some((s) => s.kind === 'step')).toBe(true)
  })

  it('leaves non-matching lines fully plain', () => {
    const source = '# Hi'
    const [line] = highlightSteps({ varPath: 'hello.var.md', source, steps })
    expect(line).toEqual([{ text: '# Hi', kind: 'plain' }])
  })

  it('returns all-plain lines when no steps are supplied', () => {
    const source = 'First I greet "world"'
    const [line] = highlightSteps({ varPath: 'hello.var.md', source, steps: [] })
    expect(line).toEqual([{ text: 'First I greet "world"', kind: 'plain' }])
  })
})

describe('decodeEntities', () => {
  it('reverses the entities Astro emits', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;q&quot; &#39;x&#39; &#34;y&#34;')).toBe(
      'a & b <c> "q" \'x\' "y"',
    )
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/step-highlight.test.ts`
Expected: FAIL — module `./step-highlight.js` not found / `highlightSteps` undefined.

- [ ] **Step 6: Implement the helper**

Create `packages/website/src/lib/step-highlight.ts`:

```ts
import { buildWorkspaceIndex } from '@oselvar/var-language'

export type SegmentKind = 'plain' | 'step' | 'param'
export type Segment = { readonly text: string; readonly kind: SegmentKind }
export type HighlightedLine = ReadonlyArray<Segment>

type StepFile = { readonly path: string; readonly source: string }

// Astro escapes a fixed set of characters when it renders a text expression
// into a slot. Reverse exactly that set to recover the raw source. `&amp;`
// must be decoded last so we never double-decode.
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Rank by precedence so a character covered by both a step and a param renders
// as a param (the more specific span).
const RANK: Record<SegmentKind, number> = { plain: 0, step: 1, param: 2 }

export function highlightSteps(input: {
  readonly varPath: string
  readonly source: string
  readonly steps: ReadonlyArray<StepFile>
}): ReadonlyArray<HighlightedLine> {
  const { varPath, source, steps } = input
  const lines = source.split('\n')

  if (steps.length === 0) {
    return lines.map((text) => [{ text, kind: 'plain' as const }])
  }

  const index = buildWorkspaceIndex({
    stepFiles: steps.map((s) => ({ path: s.path, source: s.source })),
    varFiles: [{ path: varPath, source }],
  })
  const matches = index.matches.filter((m) => m.varPath === varPath)

  // Per line, a kind for every character (default plain). var-language ranges
  // are 1-based with an exclusive end; convert to 0-based half-open here.
  const kinds: SegmentKind[][] = lines.map((l) => new Array<SegmentKind>(l.length).fill('plain'))

  const paint = (
    range: { start: { line: number; character: number }; end: { line: number; character: number } },
    kind: SegmentKind,
  ): void => {
    for (let line = range.start.line; line <= range.end.line; line++) {
      const row = kinds[line - 1]
      if (!row) continue
      const from = line === range.start.line ? range.start.character - 1 : 0
      const to = line === range.end.line ? range.end.character - 1 : row.length
      for (let c = Math.max(0, from); c < Math.min(row.length, to); c++) {
        if (RANK[kind] > RANK[row[c] as SegmentKind]) row[c] = kind
      }
    }
  }

  for (const m of matches) {
    paint(m.range, 'step')
    for (const p of m.paramRanges) paint(p, 'param')
  }

  return lines.map((text, li) => coalesce(text, kinds[li] as SegmentKind[]))
}

function coalesce(text: string, kinds: ReadonlyArray<SegmentKind>): HighlightedLine {
  if (text.length === 0) return [{ text: '', kind: 'plain' }]
  const out: Segment[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || kinds[i] !== kinds[start]) {
      out.push({ text: text.slice(start, i), kind: kinds[start] as SegmentKind })
      start = i
    }
  }
  return out
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run packages/website/src/lib/step-highlight.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/website/package.json packages/website/vitest.config.ts packages/website/src/lib/step-highlight.ts packages/website/src/lib/step-highlight.test.ts pnpm-lock.yaml
git commit -m "feat(website): pure step-highlight helper over @oselvar/var-language"
```

---

### Task 2: Render highlights in FileEditor

**Files:**
- Modify: `packages/website/src/components/FileEditor.astro`

**Interfaces:**
- Consumes: `highlightSteps`, `decodeEntities` from `../lib/step-highlight.js`.
- Produces: optional prop `steps?: ReadonlyArray<{ path: string; source: string }>` on `FileEditor`; CSS classes `.fe-step`, `.fe-param`.

The component currently (verbatim, frontmatter):

```astro
interface Props {
  filename: string
}

const { filename } = Astro.props
```
and renders the body line:
```astro
    <pre class="fe-code"><code set:html={body}></code></pre>
```

- [ ] **Step 1: Extend the frontmatter** — add the import, the `steps` prop, and compute highlighted lines.

Replace the `interface Props { ... }` / `const { filename } = Astro.props` block with:

```astro
import { decodeEntities, highlightSteps } from '../lib/step-highlight.js'

interface Props {
  filename: string
  steps?: ReadonlyArray<{ path: string; source: string }>
}

const { filename, steps } = Astro.props
```

Then, immediately after the existing `const body = (await Astro.slots.render('default'))...` line, add:

```astro
const highlighted =
  steps && steps.length > 0
    ? highlightSteps({ varPath: filename, source: decodeEntities(body), steps })
    : null
```

And change the existing gutter line so the count works for both paths. Replace:

```astro
const gutter = body.split('\n').map((_, i) => i + 1).join('\n')
```
with:
```astro
const lineCount = highlighted ? highlighted.length : body.split('\n').length
const gutter = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')
```

- [ ] **Step 2: Render segments when highlighting** — replace the body `<pre class="fe-code">…</pre>` line with:

```astro
    <pre class="fe-code">{
      highlighted ? (
        <code>{highlighted.map((line, i) => (
          <Fragment>{line.map((seg) =>
            seg.kind === 'param' ? <span class="fe-param">{seg.text}</span>
            : seg.kind === 'step' ? <span class="fe-step">{seg.text}</span>
            : seg.text,
          )}{i < highlighted.length - 1 ? '\n' : ''}</Fragment>
        ))}</code>
      ) : (
        <code set:html={body} />
      )
    }</pre>
```

- [ ] **Step 3: Add the highlight styles** — inside the component's `<style>` block (e.g. after the existing `.fe-code code { ... }` rule), add:

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

- [ ] **Step 4: Verify the component still compiles (no `steps` yet, plain path unchanged)**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds, 6 pages. (No page passes `steps` yet, so output is unchanged — the highlight path is exercised in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add packages/website/src/components/FileEditor.astro
git commit -m "feat(website): FileEditor renders step/param highlights when given steps"
```

---

### Task 3: Wire the hello tutorial and verify highlighting end-to-end

**Files:**
- Modify: `packages/website/src/pages/docs/tutorials/hello-var-your-first-spec.mdx`

**Interfaces:**
- Consumes: `FileEditor` `steps` prop (Task 2); the real step file `docs/tutorial/steps/01-hello.steps.ts`.

- [ ] **Step 1: Import the real step file as raw source and pass it to `FileEditor`.**

In `packages/website/src/pages/docs/tutorials/hello-var-your-first-spec.mdx`, add this import directly under the existing `import FileEditor ...` line. The page lives at `packages/website/src/pages/docs/tutorials/`; the step file is at repo `docs/tutorial/steps/`, so the relative path climbs out of the website package:

```mdx
import helloSteps from '../../../../../../docs/tutorial/steps/01-hello.steps.ts?raw'
```

Then change the opening `<FileEditor filename="hello.var.md">` tag to pass the steps:

```mdx
<FileEditor filename="hello.var.md" steps={[{ path: '01-hello.steps.ts', source: helloSteps }]}>
```

(Leave the template-string body child exactly as it is.)

- [ ] **Step 2: Verify the relative import path resolves.**

Run: `node -e "require('fs').accessSync('docs/tutorial/steps/01-hello.steps.ts')" && echo OK`
Expected: `OK`. Then confirm the climb depth: from `packages/website/src/pages/docs/tutorials/` the segments up to repo root are `tutorials → docs → pages → src → website → packages → <root>` = six `../`, then `docs/tutorial/steps/01-hello.steps.ts`. If the build in Step 3 reports the import unresolved, adjust the number of `../` segments accordingly.

- [ ] **Step 3: Build and verify highlight spans are in the prerendered HTML.**

Run: `pnpm --filter @oselvar/website build`
Expected: build succeeds (6 pages).

Then verify the output:
```bash
F=packages/website/dist/docs/tutorials/hello-var-your-first-spec/index.html
grep -c 'class="fe-param"' "$F"   # expect >= 3 (world, Hello, world!, and the int params)
grep -c 'class="fe-step"' "$F"    # expect >= 1
grep -o 'class="fe-param">[^<]*<' "$F" | head   # should include world and Hello, world!
grep -c '<script' "$F" || echo "no scripts — still prerendered"
```
Expected: `fe-param` count ≥ 3, `fe-step` count ≥ 1, the param contents include `world` and `Hello, world!`, and no `<script>` tags.

- [ ] **Step 4: Confirm the body text is intact (no characters dropped by segmentation).**

```bash
F=packages/website/dist/docs/tutorials/hello-var-your-first-spec/index.html
python3 -c "
import re, html
h=open('$F').read()
fig=re.search(r'<figure class=\"file-editor\".*?</figure>', h, re.S).group(0)
code=re.search(r'<pre class=\"fe-code\">.*?<code>(.*?)</code>', fig, re.S).group(1)
text=html.unescape(re.sub(r'<[^>]+>', '', code))
assert '# Hello, Vár' in text and 'should evaluate to' in text, text
print('body intact')
"
```
Expected: `body intact`.

- [ ] **Step 5: Run the full check (no regressions).**

Run: `NODE_OPTIONS="--import tsx" pnpm vitest run`
Expected: the whole suite passes, including the new `step-highlight` tests.

- [ ] **Step 6: Commit**

```bash
git add packages/website/src/pages/docs/tutorials/hello-var-your-first-spec.mdx
git commit -m "feat(website): highlight steps in the Hello Vár tutorial via real step file"
```

---

## Notes for the implementer

- Run tasks in order. Task 2 has no visible effect until Task 3 supplies a `steps` prop.
- The `decodeEntities` ↔ Astro-escape pairing is the one fragile point: if the build verification in Task 3 shows param contents that look double-escaped or misaligned, check which entities Astro actually emitted in the raw HTML and extend `decodeEntities` to match, then re-run.
- Do not import from `@oselvar/var-lsp` anywhere.
