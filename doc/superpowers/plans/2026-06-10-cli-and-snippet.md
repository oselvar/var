# Plan 3 — CLI + Templated Snippet Generator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `bdd` CLI with three subcommands — `stepdef`, `lint`, `init` — and rework the snippet generator to render TypeScript through a mustache-style template that users can override via `bdd.config.ts`.

**Architecture:** Functional core (template renderer, snippet shaping, lint serializer) lives in `@oselvar/bdd`. The CLI (`@oselvar/bdd-cli`) is the thin imperative shell — argv parsing, file I/O, terminal prompts, exit codes. Same runtime works under Node, Bun, and Deno; no per-runtime CLI needed.

**Tech Stack:** Same as Plans 1/2 + zero new deps. The mustache renderer is hand-rolled (~30 lines for `{{var}}` substitution); no `yargs`/`commander`/`chalk`/`inquirer`.

**Depends on:** Plans 1, 1b, 1c, 2.

**Out of scope (deferred):**
- `bdd run` standalone runner (lives in Plan 4 alongside the `node:test` adapter)
- Mustache sections (`{{#list}}{{/list}}`) — add when a real template needs them
- HMR / watch polish — Plan 2b

---

## Task 1: `renderTemplate` in `@oselvar/bdd`

**Files:**
- Create: `packages/bdd/src/template.ts`
- Create: `packages/bdd/tests/template.test.ts`
- Modify: `packages/bdd/src/index.ts` (re-export)

A tiny mustache subset that supports `{{var}}` substitution. No escaping (we emit TS, not HTML). Missing keys substitute as empty string — predictable for codegen.

- [ ] **Step 1: Write failing tests**

`packages/bdd/tests/template.test.ts`:
```ts
import { expect, test } from 'vitest'
import { renderTemplate } from '../src/template.js'

test('substitutes {{name}} placeholders from vars', () => {
  expect(renderTemplate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!')
})

test('supports multiple distinct placeholders', () => {
  const out = renderTemplate('step({{expression}}, {{args}})', {
    expression: "'I have {int} cukes'",
    args: 'ctx, count: number',
  })
  expect(out).toBe("step('I have {int} cukes', ctx, count: number)")
})

test('replaces every occurrence of the same placeholder', () => {
  expect(renderTemplate('{{x}}/{{x}}/{{x}}', { x: 'a' })).toBe('a/a/a')
})

test('missing keys become empty strings (no throw)', () => {
  expect(renderTemplate('a={{a}} b={{b}}', { a: '1' })).toBe('a=1 b=')
})

test('tolerates whitespace inside the braces', () => {
  expect(renderTemplate('Hello {{ name }}!', { name: 'world' })).toBe('Hello world!')
})

test('leaves text without placeholders untouched', () => {
  expect(renderTemplate('just plain text', {})).toBe('just plain text')
})

test('does not substitute single braces', () => {
  expect(renderTemplate('{not a placeholder}', { 'not a placeholder': 'x' })).toBe(
    '{not a placeholder}',
  )
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd test`
Expected: cannot resolve `../src/template.js`.

- [ ] **Step 3: Implement `packages/bdd/src/template.ts`**

```ts
export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
}
```

- [ ] **Step 4: Re-export from `packages/bdd/src/index.ts`**

Add at the end:
```ts
export { renderTemplate } from './template.js'
```

- [ ] **Step 5: Verify**

```
pnpm test
pnpm lint
pnpm knip
pnpm jscpd
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/bdd/src/template.ts packages/bdd/src/index.ts packages/bdd/tests/template.test.ts
git commit -m "feat(bdd): add renderTemplate (mustache-style {{var}} subset)"
```

---

## Task 2: Default snippet template + plumb into `generateSnippet`

**Files:**
- Create: `packages/bdd/src/snippet-template.ts`
- Modify: `packages/bdd/src/snippet.ts`
- Modify: `packages/bdd/tests/snippet.test.ts`

Replace the hardcoded `fullCode = "step('${expr}', ..."` with `renderTemplate(template ?? DEFAULT_TEMPLATE, vars)`. Callers can pass any template; default ships with the package.

- [ ] **Step 1: Write the default template constant**

`packages/bdd/src/snippet-template.ts`:
```ts
// Default TypeScript snippet for the `step()` API. Variables:
//   {{expression}}   — the cucumber expression, e.g. `I have {int} cukes`
//   {{args}}         — formatted handler args, e.g. `ctx, count: number`
//   {{originalText}} — the raw input the user typed
export const DEFAULT_SNIPPET_TEMPLATE = `step('{{expression}}', ({{args}}) => {
  // Write code here that turns the phrase above into concrete actions
  throw new Error('not implemented')
})
`
```

- [ ] **Step 2: Update `Snippet` and `generateSnippet`**

In `packages/bdd/src/snippet.ts`:
- Add `template?: string` to the options object accepted by `generateSnippet`.
- Compute `originalText` (the raw input — currently it's a local `rawText`).
- After computing `expression` and `handlerArgs`, render `fullCode` via `renderTemplate(template ?? DEFAULT_SNIPPET_TEMPLATE, { expression, args: handlerArgs.join(', '), originalText })`.

Update the signature to:
```ts
export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: { readonly template?: string } = {},
): Snippet
```

Backward-compat: existing callers pass two args; the third defaults to `{}`.

- [ ] **Step 3: Update existing snippet tests**

The current tests expect `s.handlerSignature === '(ctx, count: number) => {'`. The new `fullCode` uses the template. Replace the `fullCode` assertion (where applicable) with one that matches the default template's output. Keep `expression` and `handlerSignature` assertions unchanged.

Add a new test for the override:
```ts
test('accepts a custom template via options.template', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    template: `[{{expression}}] :: ({{args}})`,
  })
  expect(s.fullCode).toBe('[I have {int} cukes] :: (ctx, count: number)')
})

test('default template renders the "Write code here" comment and an Error throw', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry())
  expect(s.fullCode).toContain("step('I have {int} cukes', (ctx, count: number) => {")
  expect(s.fullCode).toContain('Write code here that turns the phrase above into concrete actions')
  expect(s.fullCode).toContain("throw new Error('not implemented')")
})
```

- [ ] **Step 4: Verify**

```
pnpm test
pnpm lint
pnpm knip
pnpm jscpd
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add packages/bdd/src/snippet.ts packages/bdd/src/snippet-template.ts packages/bdd/tests/snippet.test.ts
git commit -m "feat(bdd): generate snippets via overridable mustache template"
```

Also re-export `DEFAULT_SNIPPET_TEMPLATE` from `packages/bdd/src/index.ts`:
```ts
export { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'
```

(Add to the same commit.)

---

## Task 3: Move `loadBddConfig` to `@oselvar/bdd` core; add `snippet.template`

**Files:**
- Create: `packages/bdd/src/config.ts` (moved from `packages/bdd-vitest/src/config.ts`)
- Create: `packages/bdd/tests/config.test.ts`
- Delete: `packages/bdd-vitest/src/config.ts`
- Delete: `packages/bdd-vitest/tests/config.test.ts`
- Modify: `packages/bdd-vitest/src/plugin.ts` (import from core)
- Modify: `packages/bdd/src/index.ts` (re-export)
- Modify: `packages/bdd-vitest/src/index.ts` (re-export from core)

Why move it: both the CLI (Plan 3) and the vitest adapter (Plan 2) consume the same `bdd.config.ts`. Core is the right home — config loading is pure data ingest (filesystem at the seam, but no test-runner dependencies).

- [ ] **Step 1: Move the file**

Copy `packages/bdd-vitest/src/config.ts` to `packages/bdd/src/config.ts`. Then EXTEND `BddConfig` with a snippet block:

```ts
export type BddConfig = {
  readonly bdds: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template: string }  // resolved (defaulted)
}

const DEFAULT_CONFIG: BddConfig = {
  bdds: ['**/*.bdd.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
}
```

Update `loadBddConfig` to merge a user's optional `snippet` block:
```ts
return {
  bdds: cfg.bdds ?? DEFAULT_CONFIG.bdds,
  steps: cfg.steps ?? DEFAULT_CONFIG.steps,
  snippet: {
    template: cfg.snippet?.template ?? DEFAULT_CONFIG.snippet.template,
  },
}
```

Import `DEFAULT_SNIPPET_TEMPLATE` from `./snippet-template.js`.

- [ ] **Step 2: Move + extend the tests**

Copy `packages/bdd-vitest/tests/config.test.ts` to `packages/bdd/tests/config.test.ts`. Add a test for the snippet override:

```ts
test('loads snippet.template from bdd.config.ts when provided', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-cfg-snippet-'))
  try {
    writeFileSync(
      join(dir, 'bdd.config.ts'),
      `export default {
        bdds: ['**/*.bdd.md'],
        steps: ['**/*.steps.ts'],
        snippet: { template: 'CUSTOM: {{expression}}' },
      }\n`,
    )
    const cfg = await loadBddConfig(dir)
    expect(cfg.snippet.template).toBe('CUSTOM: {{expression}}')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('defaults snippet.template to DEFAULT_SNIPPET_TEMPLATE when absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-cfg-snippet-default-'))
  try {
    const cfg = await loadBddConfig(dir)
    expect(cfg.snippet.template).toContain("step('{{expression}}'")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Update existing tests**

The original `loads bdd.config.ts` and `returns defaults` tests at `packages/bdd-vitest/tests/config.test.ts` should be deleted (moved to core). Verify by running tests.

- [ ] **Step 4: Re-export from core**

In `packages/bdd/src/index.ts`:
```ts
export { loadBddConfig } from './config.js'
export type { BddConfig } from './config.js'
```

- [ ] **Step 5: Update `bdd-vitest` to import from core**

In `packages/bdd-vitest/src/plugin.ts`, change:
```ts
import { loadBddConfig } from './config.js'
```
to:
```ts
import { loadBddConfig } from '@oselvar/bdd'
```

In `packages/bdd-vitest/src/index.ts`, replace the local re-export with a re-export from core:
```ts
export { loadBddConfig } from '@oselvar/bdd'
export type { BddConfig } from '@oselvar/bdd'
```

- [ ] **Step 6: Delete the moved files**

```bash
rm packages/bdd-vitest/src/config.ts packages/bdd-vitest/tests/config.test.ts
```

- [ ] **Step 7: Verify**

```
pnpm test
pnpm lint
pnpm knip
pnpm jscpd
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add packages/bdd/src/config.ts packages/bdd/src/index.ts packages/bdd/tests/config.test.ts packages/bdd-vitest/src/plugin.ts packages/bdd-vitest/src/index.ts
git rm packages/bdd-vitest/src/config.ts packages/bdd-vitest/tests/config.test.ts
git commit -m "refactor(bdd): move loadBddConfig to core; add snippet.template config"
```

---

## Task 4: `@oselvar/bdd-cli` package skeleton

**Files:**
- Create: `packages/bdd-cli/package.json`
- Create: `packages/bdd-cli/tsconfig.json`
- Create: `packages/bdd-cli/vitest.config.ts`
- Create: `packages/bdd-cli/src/index.ts`
- Create: `packages/bdd-cli/src/bin.ts`
- Create: `packages/bdd-cli/tests/smoke.test.ts`
- Modify: `knip.json` (add the new workspace)
- Modify: `pnpm-workspace.yaml` (already includes `packages/*` — no change needed)

- [ ] **Step 1: Write `packages/bdd-cli/package.json`**

```json
{
  "name": "@oselvar/bdd-cli",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./dist/index.js" }
  },
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "bin": { "bdd": "./dist/bin.js" },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@oselvar/bdd": "workspace:*"
  },
  "publishConfig": {
    "exports": {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
    },
    "types": "./dist/index.d.ts"
  }
}
```

- [ ] **Step 2: `packages/bdd-cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: `packages/bdd-cli/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 4: `packages/bdd-cli/src/index.ts`**

```ts
export type { Bdd } from '@oselvar/bdd'
export const VERSION = '0.0.0'
```

(Re-export of `Bdd` makes `@oselvar/bdd` a used dep; knip stays happy.)

- [ ] **Step 5: `packages/bdd-cli/src/bin.ts`**

```ts
#!/usr/bin/env node
// Entry point for the `bdd` binary. Routes argv to subcommands.
process.exitCode = 0
```

This is a no-op placeholder. Task 5 wires in the real argv parser.

- [ ] **Step 6: `packages/bdd-cli/tests/smoke.test.ts`**

```ts
import { expect, test } from 'vitest'
import { VERSION } from '../src/index.js'

test('package exposes a version constant', () => {
  expect(VERSION).toBe('0.0.0')
})
```

- [ ] **Step 7: Update `knip.json`**

Add to `workspaces`:
```json
"packages/bdd-cli": {
  "entry": ["src/index.ts", "src/bin.ts"],
  "project": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 8: Verify**

```
pnpm install
pnpm test
pnpm lint
pnpm knip
pnpm jscpd
pnpm build
```

Confirm `packages/bdd-cli/dist/bin.js` exists after `pnpm build`.

- [ ] **Step 9: Commit**

```bash
git add packages/bdd-cli/ knip.json pnpm-lock.yaml
git commit -m "chore(bdd-cli): scaffold @oselvar/bdd-cli package with bin entry"
```

---

## Task 5: Argv parser + subcommand router

**Files:**
- Create: `packages/bdd-cli/src/argv.ts`
- Create: `packages/bdd-cli/tests/argv.test.ts`
- Modify: `packages/bdd-cli/src/bin.ts`

Hand-rolled, no deps. Supports `bdd <subcommand> [args] [--flag] [--key value]`.

- [ ] **Step 1: Write failing tests**

`packages/bdd-cli/tests/argv.test.ts`:
```ts
import { expect, test } from 'vitest'
import { parseArgv } from '../src/argv.js'

test('parses a subcommand with positionals', () => {
  const r = parseArgv(['stepdef', 'I have 5 cukes'])
  expect(r.command).toBe('stepdef')
  expect(r.positionals).toEqual(['I have 5 cukes'])
  expect(r.flags).toEqual({})
})

test('parses long flags with values', () => {
  const r = parseArgv(['stepdef', 'I have 5 cukes', '--file', 'steps/foo.steps.ts'])
  expect(r.flags.file).toBe('steps/foo.steps.ts')
})

test('parses long flags without values as true', () => {
  const r = parseArgv(['lint', '--json'])
  expect(r.flags.json).toBe(true)
})

test('parses --key=value syntax', () => {
  const r = parseArgv(['stepdef', 'x', '--file=steps/foo.steps.ts'])
  expect(r.flags.file).toBe('steps/foo.steps.ts')
})

test('reports the empty command when no args', () => {
  const r = parseArgv([])
  expect(r.command).toBe('')
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-cli test`
Expected: cannot resolve `../src/argv.js`.

- [ ] **Step 3: Implement `packages/bdd-cli/src/argv.ts`**

```ts
export type ParsedArgv = {
  readonly command: string
  readonly positionals: ReadonlyArray<string>
  readonly flags: Readonly<Record<string, string | true>>
}

export function parseArgv(argv: ReadonlyArray<string>): ParsedArgv {
  if (argv.length === 0) return { command: '', positionals: [], flags: {} }
  const command = argv[0] ?? ''
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i] ?? ''
    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq !== -1) {
        const key = token.slice(2, eq)
        flags[key] = token.slice(eq + 1)
      } else {
        const key = token.slice(2)
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      }
    } else {
      positionals.push(token)
    }
  }
  return { command, positionals, flags }
}
```

- [ ] **Step 4: Wire into `bin.ts`**

```ts
#!/usr/bin/env node
import { parseArgv } from './argv.js'

const parsed = parseArgv(process.argv.slice(2))

switch (parsed.command) {
  case '':
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write(`bdd — markdown-native BDD\n\nUsage:\n  bdd stepdef "<text>"   generate a step definition\n  bdd lint [globs]       check for missing/ambiguous/orphan steps\n  bdd init               scaffold a new project\n`)
    break
  default:
    process.stderr.write(`bdd: unknown command "${parsed.command}". Try \`bdd help\`.\n`)
    process.exitCode = 1
}
```

- [ ] **Step 5: Verify**

```
pnpm --filter @oselvar/bdd-cli test
pnpm lint
pnpm build
node packages/bdd-cli/dist/bin.js help
```

Last command should print the usage block.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-cli/src/argv.ts packages/bdd-cli/src/bin.ts packages/bdd-cli/tests/argv.test.ts
git commit -m "feat(bdd-cli): add argv parser and subcommand router"
```

---

## Task 6: `bdd stepdef` subcommand

**Files:**
- Create: `packages/bdd-cli/src/stepdef.ts`
- Create: `packages/bdd-cli/tests/stepdef.test.ts`
- Modify: `packages/bdd-cli/src/bin.ts`

Reads input text, runs `generateSnippet` with the config's template, decides where to write based on flags/TTY.

- [ ] **Step 1: Write failing tests**

`packages/bdd-cli/tests/stepdef.test.ts`:
```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runStepdef } from '../src/stepdef.js'

test('writes the snippet to the file specified by --file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-'))
  try {
    const target = join(dir, 'steps.ts')
    writeFileSync(target, '')
    const result = await runStepdef({
      text: 'I have 5 cukes',
      file: target,
      print: false,
      cwd: dir,
      writeStdout: () => {},
    })
    expect(result.exitCode).toBe(0)
    const written = readFileSync(target, 'utf8')
    expect(written).toContain("step('I have {int} cukes', (ctx, count: number) => {")
    expect(written).toContain("throw new Error('not implemented')")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--print writes to stdout, not the file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-print-'))
  try {
    const captured: string[] = []
    const result = await runStepdef({
      text: 'I have 5 cukes',
      file: undefined,
      print: true,
      cwd: dir,
      writeStdout: (s) => captured.push(s),
    })
    expect(result.exitCode).toBe(0)
    expect(captured.join('')).toContain("step('I have {int} cukes',")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('appends to an existing step file (does not overwrite)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-append-'))
  try {
    const target = join(dir, 'steps.ts')
    writeFileSync(target, "import { step } from '@oselvar/bdd-vitest'\n\n")
    await runStepdef({
      text: 'I have 5 cukes',
      file: target,
      print: false,
      cwd: dir,
      writeStdout: () => {},
    })
    const written = readFileSync(target, 'utf8')
    expect(written).toContain("import { step } from '@oselvar/bdd-vitest'")
    expect(written).toContain("step('I have {int} cukes',")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('honors snippet.template from bdd.config.ts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-stepdef-custom-'))
  try {
    writeFileSync(
      join(dir, 'bdd.config.ts'),
      `export default { snippet: { template: 'CUSTOM:{{expression}}' } }\n`,
    )
    const target = join(dir, 'steps.ts')
    writeFileSync(target, '')
    await runStepdef({
      text: 'I have 5 cukes',
      file: target,
      print: false,
      cwd: dir,
      writeStdout: () => {},
    })
    expect(readFileSync(target, 'utf8')).toContain('CUSTOM:I have {int} cukes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-cli test`
Expected: cannot resolve `../src/stepdef.js`.

- [ ] **Step 3: Implement `packages/bdd-cli/src/stepdef.ts`**

```ts
import { appendFileSync, existsSync } from 'node:fs'
import { createRegistry, generateSnippet, loadBddConfig } from '@oselvar/bdd'

export type StepdefOptions = {
  readonly text: string
  readonly file: string | undefined
  readonly print: boolean
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type StepdefResult = { readonly exitCode: number }

export async function runStepdef(opts: StepdefOptions): Promise<StepdefResult> {
  const cfg = await loadBddConfig(opts.cwd)
  const snippet = generateSnippet(opts.text, createRegistry(), { template: cfg.snippet.template })
  if (opts.print || !opts.file) {
    opts.writeStdout(snippet.fullCode)
    return { exitCode: 0 }
  }
  if (!existsSync(opts.file)) {
    appendFileSync(opts.file, '')
  }
  appendFileSync(opts.file, snippet.fullCode)
  return { exitCode: 0 }
}
```

- [ ] **Step 4: Wire into `bin.ts`**

Replace the `default` case in `bin.ts`'s switch and add a `case 'stepdef':`:

```ts
import { runStepdef } from './stepdef.js'

// ...inside the switch:
case 'stepdef': {
  const text = parsed.positionals[0]
  if (!text) {
    process.stderr.write('bdd stepdef: missing text argument\n')
    process.exitCode = 1
    break
  }
  const file = typeof parsed.flags.file === 'string' ? parsed.flags.file : undefined
  const print = parsed.flags.print === true
  const result = await runStepdef({
    text,
    file,
    print,
    cwd: process.cwd(),
    writeStdout: (s) => process.stdout.write(s),
  })
  process.exitCode = result.exitCode
  break
}
```

Make sure `bin.ts` uses top-level await (already supported in Node 22 ESM) or wraps the switch in `async function main()` with `main()`.

- [ ] **Step 5: Verify**

```
pnpm --filter @oselvar/bdd-cli test
pnpm lint
pnpm knip
pnpm build
node packages/bdd-cli/dist/bin.js stepdef "I have 5 cukes" --print
```

Last command should print the templated snippet.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-cli/src/stepdef.ts packages/bdd-cli/src/bin.ts packages/bdd-cli/tests/stepdef.test.ts
git commit -m "feat(bdd-cli): bdd stepdef subcommand"
```

---

## Task 7: `bdd lint` subcommand

**Files:**
- Create: `packages/bdd-cli/src/lint.ts`
- Create: `packages/bdd-cli/tests/lint.test.ts`
- Modify: `packages/bdd-cli/src/bin.ts`

Globs `.bdd.md` files, parses + plans against an empty registry (we treat unmatched keyword-led sentences as the lint signal), emits diagnostics. With `--json` the output is a stable JSON shape for CI; without it, human-readable.

- [ ] **Step 1: Write failing tests**

`packages/bdd-cli/tests/lint.test.ts`:
```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runLint } from '../src/lint.js'

test('reports missing-step diagnostic for a keyword-led unmatched sentence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-'))
  try {
    writeFileSync(join(dir, 'a.bdd.md'), '# A\n\nGiven I have 5 cukes')
    const captured: string[] = []
    const result = await runLint({
      cwd: dir,
      json: true,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    expect(result.exitCode).toBe(1)
    const parsed = JSON.parse(captured.join(''))
    expect(Array.isArray(parsed.diagnostics)).toBe(true)
    expect(parsed.diagnostics[0].code).toBe('missing-step')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('exit code 0 when no diagnostics found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-clean-'))
  try {
    writeFileSync(join(dir, 'docs.bdd.md'), '# Just docs\n\nSome prose with no keyword-led sentences.')
    const result = await runLint({
      cwd: dir,
      json: true,
      globs: undefined,
      writeStdout: () => {},
      writeStderr: () => {},
    })
    expect(result.exitCode).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('human-readable output (no --json) lists path:line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-text-'))
  try {
    writeFileSync(join(dir, 'a.bdd.md'), '# A\n\nGiven I have 5 cukes')
    const captured: string[] = []
    await runLint({
      cwd: dir,
      json: false,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    const out = captured.join('')
    expect(out).toContain('a.bdd.md')
    expect(out).toContain('missing-step')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-cli test`
Expected: cannot resolve `../src/lint.js`.

- [ ] **Step 3: Implement `packages/bdd-cli/src/lint.ts`**

```ts
import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRegistry, loadBddConfig, parse, plan } from '@oselvar/bdd'

export type LintOptions = {
  readonly cwd: string
  readonly json: boolean
  readonly globs: ReadonlyArray<string> | undefined
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
}

export type LintResult = { readonly exitCode: number }

export async function runLint(opts: LintOptions): Promise<LintResult> {
  const cfg = await loadBddConfig(opts.cwd)
  const patterns = opts.globs && opts.globs.length > 0 ? opts.globs : cfg.bdds
  const files = await findFiles(opts.cwd, patterns)
  const registry = createRegistry()
  type Item = { path: string; code: string; line: number; col: number; message: string }
  const items: Item[] = []
  for (const path of files) {
    const source = readFileSync(path, 'utf8')
    const result = plan(parse(path, source), registry)
    for (const d of result.diagnostics) {
      items.push({
        path,
        code: d.code,
        line: d.span.startLine,
        col: d.span.startCol,
        message: d.message,
      })
    }
  }
  if (opts.json) {
    opts.writeStdout(JSON.stringify({ diagnostics: items }, null, 2))
  } else {
    for (const it of items) {
      opts.writeStdout(`${it.path}:${it.line}:${it.col}  ${it.code}  ${firstLine(it.message)}\n`)
    }
  }
  return { exitCode: items.some((i) => isError(i.code)) ? 1 : 0 }
}

function firstLine(s: string): string {
  const i = s.indexOf('\n')
  return i === -1 ? s : s.slice(0, i)
}

function isError(code: string): boolean {
  return code === 'missing-step' || code === 'ambiguous-match'
}

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  const nativeGlob = glob as unknown as (
    pattern: string,
    opts: { cwd: string },
  ) => AsyncIterable<string>
  for (const pattern of patterns) {
    for await (const entry of nativeGlob(pattern, { cwd })) {
      const abs = resolve(cwd, entry)
      if (!seen.has(abs)) {
        seen.add(abs)
        out.push(abs)
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Wire into `bin.ts`**

```ts
case 'lint': {
  const result = await runLint({
    cwd: process.cwd(),
    json: parsed.flags.json === true,
    globs: parsed.positionals.length > 0 ? parsed.positionals : undefined,
    writeStdout: (s) => process.stdout.write(s),
    writeStderr: (s) => process.stderr.write(s),
  })
  process.exitCode = result.exitCode
  break
}
```

(Add the `import { runLint } from './lint.js'` at the top.)

- [ ] **Step 5: Verify**

```
pnpm --filter @oselvar/bdd-cli test
pnpm lint
pnpm knip
pnpm build
node packages/bdd-cli/dist/bin.js lint  # in the workspace root, exit 0 (no orphans in docs/tutorial)
```

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-cli/src/lint.ts packages/bdd-cli/src/bin.ts packages/bdd-cli/tests/lint.test.ts
git commit -m "feat(bdd-cli): bdd lint subcommand with --json output"
```

---

## Task 8: `bdd init` subcommand

**Files:**
- Create: `packages/bdd-cli/src/init.ts`
- Create: `packages/bdd-cli/tests/init.test.ts`
- Modify: `packages/bdd-cli/src/bin.ts`

Scaffolds a minimal project in `cwd`:
- `bdd.config.ts`
- `bdd-examples/01-hello.bdd.md`
- `bdd-examples/steps/01-hello.steps.ts`

Refuses to overwrite existing files; reports per-file outcomes.

- [ ] **Step 1: Write failing tests**

`packages/bdd-cli/tests/init.test.ts`:
```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runInit } from '../src/init.js'

test('scaffolds bdd.config.ts and an example .bdd.md + steps file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-init-'))
  try {
    const result = await runInit({ cwd: dir, writeStdout: () => {} })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, 'bdd.config.ts'))).toBe(true)
    expect(existsSync(join(dir, 'bdd-examples/01-hello.bdd.md'))).toBe(true)
    expect(existsSync(join(dir, 'bdd-examples/steps/01-hello.steps.ts'))).toBe(true)
    const stepsTs = readFileSync(join(dir, 'bdd-examples/steps/01-hello.steps.ts'), 'utf8')
    expect(stepsTs).toContain('defineContext')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses to overwrite an existing bdd.config.ts; reports which files were skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-init-conflict-'))
  try {
    writeFileSync(join(dir, 'bdd.config.ts'), '/* mine */')
    const captured: string[] = []
    const result = await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(dir, 'bdd.config.ts'), 'utf8')).toBe('/* mine */')
    expect(captured.join('')).toContain('skipped')
    expect(captured.join('')).toContain('bdd.config.ts')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @oselvar/bdd-cli test`
Expected: cannot resolve `../src/init.js`.

- [ ] **Step 3: Implement `packages/bdd-cli/src/init.ts`**

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CONFIG = `export default {
  bdds: ['bdd-examples/**/*.bdd.md'],
  steps: ['bdd-examples/**/*.steps.ts'],
}
`

const EXAMPLE_MD = `# Hello, BDD

Given I greet "world"
Then the greeting is "Hello, world!"
`

const EXAMPLE_STEPS = `import { defineContext } from '@oselvar/bdd-vitest'

const { step } = defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name: string) => {
  ctx.greeting = \`Hello, \${name}!\`
})

step('the greeting is {string}', (ctx, expected: string) => {
  if (ctx.greeting !== expected) {
    throw new Error(\`Expected \${expected}, got \${ctx.greeting}\`)
  }
})
`

export type InitOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
}

export type InitResult = { readonly exitCode: number }

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const files: Array<{ readonly relPath: string; readonly content: string }> = [
    { relPath: 'bdd.config.ts', content: CONFIG },
    { relPath: 'bdd-examples/01-hello.bdd.md', content: EXAMPLE_MD },
    { relPath: 'bdd-examples/steps/01-hello.steps.ts', content: EXAMPLE_STEPS },
  ]
  for (const f of files) {
    const target = join(opts.cwd, f.relPath)
    if (existsSync(target)) {
      opts.writeStdout(`skipped ${f.relPath} (already exists)\n`)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, f.content)
    opts.writeStdout(`created ${f.relPath}\n`)
  }
  return { exitCode: 0 }
}
```

- [ ] **Step 4: Wire into `bin.ts`**

```ts
case 'init': {
  const result = await runInit({
    cwd: process.cwd(),
    writeStdout: (s) => process.stdout.write(s),
  })
  process.exitCode = result.exitCode
  break
}
```

- [ ] **Step 5: Verify**

```
pnpm --filter @oselvar/bdd-cli test
pnpm lint
pnpm knip
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-cli/src/init.ts packages/bdd-cli/src/bin.ts packages/bdd-cli/tests/init.test.ts
git commit -m "feat(bdd-cli): bdd init subcommand scaffolds a starter project"
```

---

## Task 9: End-to-end CLI smoke test + final verification

**Files:**
- Create: `packages/bdd-cli/tests/e2e.test.ts`

Drives the BUILT binary (`packages/bdd-cli/dist/bin.js`) via a child process to verify the full CLI works under Node from the outside.

- [ ] **Step 1: Write the e2e test**

`packages/bdd-cli/tests/e2e.test.ts`:
```ts
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const BIN = resolve(__dirname, '..', 'dist', 'bin.js')

function run(args: ReadonlyArray<string>, cwd: string) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' })
}

describe('bdd CLI (built bin)', () => {
  test('stepdef --print emits the templated snippet to stdout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bdd-e2e-'))
    try {
      const r = run(['stepdef', 'I have 5 cukes', '--print'], dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain("step('I have {int} cukes', (ctx, count: number) => {")
      expect(r.stdout).toContain("throw new Error('not implemented')")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('init scaffolds three files and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bdd-e2e-init-'))
    try {
      const r = run(['init'], dir)
      expect(r.status).toBe(0)
      expect(readFileSync(join(dir, 'bdd.config.ts'), 'utf8')).toContain('bdds:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('lint --json exits 1 when a missing-step diagnostic is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bdd-e2e-lint-'))
    try {
      const fs = require('node:fs')
      fs.writeFileSync(join(dir, 'a.bdd.md'), '# A\n\nGiven I have 5 cukes')
      const r = run(['lint', '--json'], dir)
      expect(r.status).toBe(1)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.diagnostics[0].code).toBe('missing-step')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

NOTE: this test runs the BUILT binary. It depends on `pnpm build` having been run. The root `pnpm test` already builds first (Plan 2 wired this up).

- [ ] **Step 2: Verify**

```
pnpm test 2>&1 | tail -15
pnpm lint
pnpm knip
pnpm jscpd
pnpm build
```

All gates must pass, including the three new e2e cases.

- [ ] **Step 3: Commit**

```bash
git add packages/bdd-cli/tests/e2e.test.ts
git commit -m "test(bdd-cli): end-to-end CLI smoke against the built bin"
```

---

## Plan summary

After Plan 3, the project ships a usable `bdd` CLI that wraps the snippet generator (now templated and config-overridable), the planner's diagnostics (as `bdd lint`), and a starter scaffolder (`bdd init`). The functional core lives in `@oselvar/bdd` so the CLI itself is a thin shell — Bun and Deno can run it as-is via `bun run bdd` / `deno run npm:@oselvar/bdd-cli`.

Carry-forward:

| Capability | Comes in |
|---|---|
| `bdd run` standalone runner (no vitest) | Plan 4 |
| `@oselvar/bdd-node` adapter | Plan 4 |
| Bun adapter (`@oselvar/bdd-bun`) | Plan 5 |
| Deno adapter + multi-runtime CI matrix | Plan 6 |
| Tags + filter | v1.2 |
| LSP / VSCode | v1.3+ |
