# Plan 2 — Vitest Adapter (MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@oselvar/bdd` runnable from vitest end-to-end. Author writes `*.bdd.md` files and `*.steps.ts` files, configures the vite plugin, runs `pnpm test`, sees one vitest test per BDD example, with green/red results.

**Architecture:** Hexagonal — `@oselvar/bdd` (core, pure) defines ports; `@oselvar/bdd-vitest` (new adapter package) implements them. Step-def registration goes through a process-local mutable builder LIVING IN THE ADAPTER. When the plugin transforms a `.bdd.md` file, it generates a virtual TS module that imports the step files (populating the builder), then parses + plans the markdown, then schedules one vitest `test(name, run)` per example.

**Tech Stack:** Same as Plan 1 + vite + vitest (already installed).

**Depends on:** Plans 1, 1b, 1c (core complete).

**In scope:**
- New package `@oselvar/bdd-vitest` with vite plugin + runtime
- Core gets ports + `executePlan`
- Step-def registration API: `step()`, `defineContext()`, `defineParameterType()`
- Config loader: reads `bdd.config.ts` from cwd
- One dogfooded `tutorial/01-hello-bdd.bdd.md` proving the loop works

**Out of scope (deferred to Plan 2b+):**
- HMR (live reload on step-file changes)
- Watch-mode polish
- Multi-package step glob resolution
- More than one tutorial file
- Custom reporters

---

## Task 1: Add `@oselvar/bdd-vitest` package skeleton

**Files:**
- Create: `packages/bdd-vitest/package.json`
- Create: `packages/bdd-vitest/tsconfig.json`
- Create: `packages/bdd-vitest/vitest.config.ts`
- Create: `packages/bdd-vitest/src/index.ts`
- Create: `packages/bdd-vitest/tests/smoke.test.ts`
- Modify: `knip.json` (add `packages/bdd-vitest` workspace entry)

- [ ] **Step 1: Write `packages/bdd-vitest/package.json`**

```json
{
  "name": "@oselvar/bdd-vitest",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./runtime": { "import": "./dist/runtime.js", "types": "./dist/runtime.d.ts" }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@oselvar/bdd": "workspace:*"
  },
  "peerDependencies": {
    "vite": "^5.0.0 || ^6.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/bdd-vitest/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `packages/bdd-vitest/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 4: Write placeholder `packages/bdd-vitest/src/index.ts`**

```ts
export const VERSION = '0.0.0'
```

- [ ] **Step 5: Write smoke test `packages/bdd-vitest/tests/smoke.test.ts`**

```ts
import { expect, test } from 'vitest'
import { VERSION } from '../src/index.js'

test('package exposes a version constant', () => {
  expect(VERSION).toBe('0.0.0')
})
```

- [ ] **Step 6: Update root `knip.json` to include the new workspace**

Add to `workspaces`:
```json
"packages/bdd-vitest": {
  "entry": ["src/index.ts", "src/runtime.ts"],
  "project": ["src/**/*.ts", "tests/**/*.ts"]
}
```

(`src/runtime.ts` doesn't exist yet — knip is lenient about missing entries; the runtime file lands in Task 7.)

- [ ] **Step 7: Install and verify**

```bash
pnpm install
pnpm --filter @oselvar/bdd-vitest test
pnpm lint
pnpm knip
pnpm jscpd
pnpm --filter @oselvar/bdd-vitest build
```

All must pass.

- [ ] **Step 8: Commit**

```bash
git add packages/bdd-vitest/ knip.json pnpm-lock.yaml
git commit -m "chore(bdd-vitest): scaffold @oselvar/bdd-vitest package"
```

---

## Task 2: Add ports to `@oselvar/bdd` core

**Files:**
- Create: `packages/bdd/src/ports.ts`
- Create: `packages/bdd/tests/ports.test.ts`
- Modify: `packages/bdd/src/index.ts` (re-export)

- [ ] **Step 1: Write the test**

`packages/bdd/tests/ports.test.ts`:
```ts
import { expectTypeOf, test } from 'vitest'
import type { Reporter, TestSink } from '../src/ports.js'
import type { Diagnostic } from '../src/diagnostics.js'

test('TestSink declares example(name, run)', () => {
  expectTypeOf<TestSink['example']>().toEqualTypeOf<
    (name: string, run: () => void | Promise<void>) => void
  >()
})

test('Reporter declares diagnostic(d)', () => {
  expectTypeOf<Reporter['diagnostic']>().toEqualTypeOf<(d: Diagnostic) => void>()
})
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @oselvar/bdd test
```
Expected: cannot resolve `../src/ports.js`.

- [ ] **Step 3: Implement `packages/bdd/src/ports.ts`**

```ts
import type { Diagnostic } from './diagnostics.js'

export interface TestSink {
  example(name: string, run: () => void | Promise<void>): void
}

export interface Reporter {
  diagnostic(d: Diagnostic): void
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add:
```ts
export type { TestSink, Reporter } from './ports.js'
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @oselvar/bdd test
pnpm lint
pnpm knip
pnpm --filter @oselvar/bdd build
```

All must pass.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd/src/ports.ts packages/bdd/src/index.ts packages/bdd/tests/ports.test.ts
git commit -m "feat(bdd): add TestSink and Reporter ports"
```

---

## Task 3: Add `executePlan` to core

**Files:**
- Create: `packages/bdd/src/execute.ts`
- Create: `packages/bdd/tests/execute.test.ts`
- Modify: `packages/bdd/src/index.ts` (re-export)

- [ ] **Step 1: Write failing tests**

`packages/bdd/tests/execute.test.ts`:
```ts
import { expect, test } from 'vitest'
import { addStep, createRegistry } from '../src/registry.js'
import { parse } from '../src/parse.js'
import { plan } from '../src/plan.js'
import { executePlan } from '../src/execute.js'
import type { Diagnostic } from '../src/diagnostics.js'

test('executePlan calls sink.example for each PlannedExample', () => {
  const r = addStep(createRegistry(), {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const p = plan(parse('e.bdd.md', '# A\n\nGiven I have 5 cukes\n\n# B\n\nGiven I have 9 cukes'), r)
  const names: string[] = []
  executePlan(p, {
    sink: { example: (name) => names.push(name) },
    reporter: { diagnostic: () => {} },
  })
  expect(names).toEqual(['A', 'B'])
})

test('executePlan reports all diagnostics through reporter.diagnostic', () => {
  const r = createRegistry()
  const p = plan(parse('m.bdd.md', '# A\n\nGiven I have 5 cukes'), r)
  const got: Diagnostic[] = []
  executePlan(p, {
    sink: { example: (_n, _r) => {} },
    reporter: { diagnostic: (d) => got.push(d) },
  })
  expect(got).toHaveLength(1)
  expect(got[0]?.code).toBe('missing-step')
})

test('the sink.example run callback executes the step handlers in order', async () => {
  const calls: string[] = []
  const r = addStep(
    addStep(createRegistry(), {
      expression: 'I add {int}',
      expressionSourceFile: 's.ts',
      expressionSourceLine: 1,
      handler: (_ctx, n) => {
        calls.push(`add:${n as number}`)
      },
    }),
    {
      expression: 'I should have {int}',
      expressionSourceFile: 's.ts',
      expressionSourceLine: 2,
      handler: (_ctx, n) => {
        calls.push(`check:${n as number}`)
      },
    },
  )
  const p = plan(parse('e.bdd.md', '# Adding\n\nI add 5. I should have 5.'), r)
  let run: (() => void | Promise<void>) | undefined
  executePlan(p, {
    sink: { example: (_n, r) => { run = r } },
    reporter: { diagnostic: () => {} },
  })
  await run?.()
  expect(calls).toEqual(['add:5', 'check:5'])
})
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @oselvar/bdd test
```
Expected: cannot resolve `../src/execute.js`.

- [ ] **Step 3: Implement `packages/bdd/src/execute.ts`**

```ts
import type { ExecutionPlan } from './plan.js'
import type { Reporter, TestSink } from './ports.js'

export type ExecutePorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
}

export function executePlan(plan: ExecutionPlan, ports: ExecutePorts): void {
  for (const d of plan.diagnostics) ports.reporter.diagnostic(d)
  for (const ex of plan.examples) {
    ports.sink.example(ex.name, async () => {
      const ctx: unknown = {}
      for (const step of ex.steps) {
        await step.stepDef.handler(ctx, ...step.args)
      }
    })
  }
}
```

- [ ] **Step 4: Re-export from index.ts**

Add:
```ts
export { executePlan } from './execute.js'
export type { ExecutePorts } from './execute.js'
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @oselvar/bdd test
pnpm lint
pnpm knip
pnpm --filter @oselvar/bdd build
```

Expected: all execute.test.ts tests pass; existing tests still pass; build clean.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd/src/execute.ts packages/bdd/src/index.ts packages/bdd/tests/execute.test.ts
git commit -m "feat(bdd): add executePlan orchestrator"
```

---

## Task 4: Mutable builder + `step()`/`defineContext()`/`defineParameterType()` API in `@oselvar/bdd-vitest`

**Files:**
- Create: `packages/bdd-vitest/src/api.ts`
- Create: `packages/bdd-vitest/tests/api.test.ts`
- Modify: `packages/bdd-vitest/src/index.ts` (re-export)

- [ ] **Step 1: Write failing tests**

`packages/bdd-vitest/tests/api.test.ts`:
```ts
import { expect, test, beforeEach } from 'vitest'
import { _resetBuilder, buildRegistry, contextFactory, defineContext, defineParameterType, step } from '../src/api.js'
import { ParameterType } from '@cucumber/cucumber-expressions'

beforeEach(() => _resetBuilder())

test('step() adds a registration; buildRegistry() returns an immutable Registry', () => {
  step('I have {int} cukes', () => {})
  const r = buildRegistry()
  expect(r.steps).toHaveLength(1)
  expect(r.steps[0]?.expression).toBe('I have {int} cukes')
})

test('defineContext() sets a per-example factory used by contextFactory()', () => {
  defineContext(() => ({ balance: 0 }))
  const f = contextFactory()
  const c1 = f()
  const c2 = f()
  expect(c1).toEqual({ balance: 0 })
  expect(c1).not.toBe(c2)
})

test('contextFactory() returns a default `() => ({})` when defineContext was not called', () => {
  expect(contextFactory()()).toEqual({})
})

test('defineParameterType() registers a custom type for snippet inference', () => {
  defineParameterType({
    name: 'color',
    regexp: /red|green|blue/,
    transformer: (s) => s,
  })
  // The registry exposes the type via cucumber-expressions internals; just confirm it's there:
  const r = buildRegistry()
  const has = [...r.parameterTypes.parameterTypes].some((p) => p.name === 'color')
  expect(has).toBe(true)
})

test('duplicate step() calls throw at buildRegistry()', () => {
  step('I have {int} cukes', () => {})
  step('I have {int} cukes', () => {})
  expect(() => buildRegistry()).toThrow(/duplicate step definition/)
})
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @oselvar/bdd-vitest test
```
Expected: cannot resolve `../src/api.js`.

- [ ] **Step 3: Implement `packages/bdd-vitest/src/api.ts`**

```ts
import { ParameterType } from '@cucumber/cucumber-expressions'
import { addStep, createRegistry, type Registry, type StepHandler } from '@oselvar/bdd'

type Entry = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
  readonly handler: StepHandler
}

type CustomTypeDef = {
  readonly name: string
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly transformer: (...captures: string[]) => unknown
}

let steps: Entry[] = []
let context: (() => unknown) | undefined
let customTypes: CustomTypeDef[] = []

export function step(expression: string, handler: StepHandler): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler })
}

export function defineContext<C>(factory: () => C | Promise<C>): void {
  if (context) {
    throw new Error('defineContext() called more than once')
  }
  context = factory as () => unknown
}

export function defineParameterType<T>(opts: {
  name: string
  regexp: RegExp | ReadonlyArray<RegExp>
  transformer: (...captures: string[]) => T
}): void {
  customTypes.push(opts as CustomTypeDef)
}

export function contextFactory(): () => unknown {
  return context ?? (() => ({}))
}

export function buildRegistry(): Registry {
  let r = createRegistry()
  for (const t of customTypes) {
    const regexps = Array.isArray(t.regexp) ? t.regexp : [t.regexp as RegExp]
    r.parameterTypes.defineParameterType(
      new ParameterType(t.name, regexps, String, t.transformer, true, true),
    )
  }
  for (const e of steps) {
    r = addStep(r, {
      expression: e.expression,
      expressionSourceFile: e.sourceFile,
      expressionSourceLine: e.sourceLine,
      handler: e.handler,
    })
  }
  return r
}

export function _resetBuilder(): void {
  steps = []
  context = undefined
  customTypes = []
}

function callerLocation(): { sourceFile: string; sourceLine: number } {
  const stack = new Error('locate').stack ?? ''
  // Walk the stack to find the first frame NOT in this file.
  const lines = stack.split('\n').slice(1)
  const here = lines.findIndex((l) => l.includes('api.ts') || l.includes('/api.js'))
  const caller = lines[here + 1] ?? lines[1] ?? ''
  const m = /(\S+):(\d+):\d+\)?$/.exec(caller)
  if (!m) return { sourceFile: '<unknown>', sourceLine: 0 }
  return { sourceFile: m[1] ?? '<unknown>', sourceLine: Number(m[2] ?? 0) }
}
```

NOTE: `_resetBuilder` is exported for tests only. Mark it with the underscore so consumers know it's internal.

- [ ] **Step 4: Re-export public API from `packages/bdd-vitest/src/index.ts`**

```ts
export { step, defineContext, defineParameterType } from './api.js'
export const VERSION = '0.0.0'
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @oselvar/bdd-vitest test
pnpm lint
pnpm knip
pnpm jscpd
pnpm --filter @oselvar/bdd-vitest build
```

Expected: api tests pass; build clean. NOTE: biome may flag `let` (prefer `const`) on the module-level mutable state; that's intentional — these are the ONE place we admit mutation. If lint fails, add `// biome-ignore lint/style/useConst: module-level mutable builder` comments above each `let`.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-vitest/
git commit -m "feat(bdd-vitest): add step/defineContext/defineParameterType API"
```

---

## Task 5: Config loader

**Files:**
- Create: `packages/bdd-vitest/src/config.ts`
- Create: `packages/bdd-vitest/tests/config.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/bdd-vitest/tests/config.test.ts`:
```ts
import { expect, test } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadBddConfig } from '../src/config.js'

test('loads bdd.config.ts when present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-cfg-'))
  try {
    writeFileSync(
      join(dir, 'bdd.config.ts'),
      `export default { bdds: ['**/*.bdd.md'], steps: ['**/*.steps.ts'] }\n`,
    )
    const cfg = await loadBddConfig(dir)
    expect(cfg.bdds).toEqual(['**/*.bdd.md'])
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('returns defaults when bdd.config.ts is absent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-cfg-empty-'))
  try {
    const cfg = await loadBddConfig(dir)
    expect(cfg.bdds).toEqual(['**/*.bdd.md'])
    expect(cfg.steps).toEqual(['**/*.steps.ts'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @oselvar/bdd-vitest test
```
Expected: cannot resolve `../src/config.js`.

- [ ] **Step 3: Implement `packages/bdd-vitest/src/config.ts`**

```ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export type BddConfig = {
  readonly bdds: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
}

const DEFAULT_CONFIG: BddConfig = {
  bdds: ['**/*.bdd.md'],
  steps: ['**/*.steps.ts'],
}

export async function loadBddConfig(cwd: string): Promise<BddConfig> {
  const candidates = ['bdd.config.ts', 'bdd.config.js', 'bdd.config.mjs']
  for (const name of candidates) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    const mod = await import(pathToFileURL(path).href)
    const cfg = (mod.default ?? mod) as Partial<BddConfig>
    return {
      bdds: cfg.bdds ?? DEFAULT_CONFIG.bdds,
      steps: cfg.steps ?? DEFAULT_CONFIG.steps,
    }
  }
  return DEFAULT_CONFIG
}
```

NOTE: Loading a `.ts` config via `import()` directly works in vitest's environment because vite handles TS transformation. For non-vitest contexts (e.g. the future CLI), we'll need a TS loader. For Plan 2 scope, this is enough.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @oselvar/bdd-vitest test
pnpm lint
pnpm knip
pnpm --filter @oselvar/bdd-vitest build
```

- [ ] **Step 5: Commit**

```bash
git add packages/bdd-vitest/src/config.ts packages/bdd-vitest/tests/config.test.ts
git commit -m "feat(bdd-vitest): add bdd.config.ts loader with defaults"
```

---

## Task 6: Runtime — `runBddFile`

**Files:**
- Create: `packages/bdd-vitest/src/runtime.ts`
- Create: `packages/bdd-vitest/tests/runtime.test.ts`

- [ ] **Step 1: Write failing test**

`packages/bdd-vitest/tests/runtime.test.ts`:
```ts
import { afterEach, beforeEach, expect, test } from 'vitest'
import { _resetBuilder, step } from '../src/api.js'
import { runBddSource } from '../src/runtime.js'

beforeEach(() => _resetBuilder())
afterEach(() => _resetBuilder())

test('runBddSource emits one sink.example call per BDD example, executes its handlers', async () => {
  const calls: string[] = []
  step('I have {int} cukes', (_ctx, n) => {
    calls.push(`have:${n as number}`)
  })
  step('I eat {int}', (_ctx, n) => {
    calls.push(`eat:${n as number}`)
  })

  const seen: string[] = []
  let runs: Array<() => void | Promise<void>> = []
  runBddSource(
    '# Eating\n\nI have 5 cukes. I eat 2.',
    'belly.bdd.md',
    {
      sink: { example: (name, run) => { seen.push(name); runs.push(run) } },
      reporter: { diagnostic: () => {} },
    },
  )
  for (const r of runs) await r()
  expect(seen).toEqual(['Eating'])
  expect(calls).toEqual(['have:5', 'eat:2'])
})
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @oselvar/bdd-vitest test
```
Expected: cannot resolve `../src/runtime.js`.

- [ ] **Step 3: Implement `packages/bdd-vitest/src/runtime.ts`**

```ts
import { executePlan, parse, plan, type Reporter, type TestSink } from '@oselvar/bdd'
import { buildRegistry } from './api.js'

export type RunPorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
}

export function runBddSource(source: string, path: string, ports: RunPorts): void {
  const bdd = parse(path, source)
  const registry = buildRegistry()
  const p = plan(bdd, registry)
  executePlan(p, ports)
}
```

Also re-export `runBddSource` from `packages/bdd-vitest/src/index.ts`:
```ts
export { runBddSource } from './runtime.js'
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @oselvar/bdd-vitest test
pnpm lint
pnpm knip
pnpm --filter @oselvar/bdd-vitest build
```

- [ ] **Step 5: Commit**

```bash
git add packages/bdd-vitest/src/runtime.ts packages/bdd-vitest/src/index.ts packages/bdd-vitest/tests/runtime.test.ts
git commit -m "feat(bdd-vitest): add runBddSource runtime"
```

---

## Task 7: Vite plugin

**Files:**
- Create: `packages/bdd-vitest/src/plugin.ts`
- Create: `packages/bdd-vitest/tests/plugin.test.ts`
- Modify: `packages/bdd-vitest/src/index.ts` — default export the plugin factory

- [ ] **Step 1: Write failing test (transformer behavior — unit test of the plugin output, not a full vite instance)**

`packages/bdd-vitest/tests/plugin.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { bddVitestPlugin, generateVirtualModule } from '../src/plugin.js'

describe('generateVirtualModule', () => {
  test('produces TS that imports runtime, step files, and invokes runBddSource', () => {
    const out = generateVirtualModule({
      bddPath: '/abs/foo.bdd.md',
      stepImports: ['/abs/account.steps.ts'],
    })
    expect(out).toContain("import { test as vitestTest } from 'vitest'")
    expect(out).toContain("import { runBddSource } from '@oselvar/bdd-vitest/runtime'")
    expect(out).toContain("import '/abs/account.steps.ts'")
    expect(out).toContain("runBddSource(SOURCE, '/abs/foo.bdd.md',")
  })
})

describe('bddVitestPlugin', () => {
  test('returns a vite plugin object with name and resolveId/load hooks', () => {
    const plugin = bddVitestPlugin()
    expect(plugin.name).toBe('@oselvar/bdd-vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```
pnpm --filter @oselvar/bdd-vitest test
```
Expected: cannot resolve `../src/plugin.js`.

- [ ] **Step 3: Implement `packages/bdd-vitest/src/plugin.ts`**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { glob } from 'node:fs/promises' // Node 22+ native glob? No — use a small inline glob via fs.readdirSync
import type { Plugin } from 'vite'
import { loadBddConfig } from './config.js'

export type BddVitestPluginOptions = {
  readonly cwd?: string
}

export function bddVitestPlugin(options: BddVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: string[] = []
  return {
    name: '@oselvar/bdd-vitest',
    async configResolved() {
      const cfg = await loadBddConfig(cwd)
      stepFiles = await findFiles(cwd, cfg.steps)
    },
    async load(id) {
      if (!id.endsWith('.bdd.md')) return null
      const source = readFileSync(id, 'utf8')
      return generateVirtualModule({ bddPath: id, stepImports: stepFiles, source })
    },
  }
}

export type GenerateInput = {
  readonly bddPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
}

export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const stepImports = input.stepImports.map((p) => `import ${JSON.stringify(p)}`).join('\n')
  const pathJson = JSON.stringify(input.bddPath)
  return `import { test as vitestTest } from 'vitest'
import { runBddSource } from '@oselvar/bdd-vitest/runtime'
${stepImports}

const SOURCE = ${sourceJson}

runBddSource(SOURCE, ${pathJson}, {
  sink: { example: (name, run) => vitestTest(name, run) },
  reporter: { diagnostic: (d) => vitestTest(\`bdd:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
})
`
}

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  // Minimal glob: for each pattern, walk cwd and match. For Plan 2 scope we just shell out to fs.glob if available;
  // otherwise return all files matching the simple cases.
  const out: string[] = []
  const seen = new Set<string>()
  for (const pattern of patterns) {
    for await (const entry of (glob as unknown as (p: string, opts: { cwd: string }) => AsyncIterable<string>)(pattern, { cwd })) {
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

NOTE: `node:fs/promises` exports `glob` in Node 22+. If your `@types/node` doesn't declare it, the cast above (`as unknown as ...`) makes TS accept it. If the implementer finds the cast unappealing, they may use `fast-glob` instead and add it as a dependency.

- [ ] **Step 4: Default export the plugin from `index.ts`**

```ts
export { bddVitestPlugin, generateVirtualModule } from './plugin.js'
export type { BddVitestPluginOptions, GenerateInput } from './plugin.js'

import { bddVitestPlugin } from './plugin.js'
export default bddVitestPlugin
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @oselvar/bdd-vitest test
pnpm lint
pnpm knip
pnpm --filter @oselvar/bdd-vitest build
```

NOTE: vite is a peer dep, not a dependency, so the import `import type { Plugin } from 'vite'` works at build time only because pnpm hoists it for the workspace tests. That's fine.

- [ ] **Step 6: Commit**

```bash
git add packages/bdd-vitest/src/plugin.ts packages/bdd-vitest/src/index.ts packages/bdd-vitest/tests/plugin.test.ts
git commit -m "feat(bdd-vitest): vite plugin transforms .bdd.md to virtual test module"
```

---

## Task 8: First dogfooded tutorial + adapter e2e

**Files:**
- Create: `docs/tutorial/steps/01-hello.steps.ts`
- Create: `docs/tutorial/01-hello-bdd.bdd.md`
- Create: `bdd.config.ts` at repo root
- Modify: `vitest.workspace.ts` to include the tutorial as a separate vitest project (optional — see note)

- [ ] **Step 1: Write the first BDD tutorial document**

`docs/tutorial/01-hello-bdd.bdd.md`:
```markdown
# Hello, BDD

The simplest possible BDD example: one step. Run `pnpm test` and watch this file's heading become a passing vitest test.

Given I greet "world"
Then the greeting is "Hello, world!"
```

- [ ] **Step 2: Write step definitions**

`docs/tutorial/steps/01-hello.steps.ts`:
```ts
import { defineContext, step } from '@oselvar/bdd-vitest'

defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name: string) => {
  const c = ctx as { greeting: string }
  c.greeting = `Hello, ${name}!`
})

step('the greeting is {string}', (ctx, expected: string) => {
  const c = ctx as { greeting: string }
  if (c.greeting !== expected) {
    throw new Error(`Expected ${expected!}, got ${c.greeting}`)
  }
})
```

- [ ] **Step 3: Create `bdd.config.ts`**

```ts
export default {
  bdds: ['docs/tutorial/**/*.bdd.md'],
  steps: ['docs/tutorial/**/*.steps.ts'],
}
```

- [ ] **Step 4: Create a vitest config that uses the plugin**

`docs/tutorial/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import bdd from '@oselvar/bdd-vitest'

export default defineConfig({
  plugins: [bdd({ cwd: new URL('../..', import.meta.url).pathname })],
  test: {
    include: ['docs/tutorial/**/*.bdd.md'],
  },
})
```

- [ ] **Step 5: Wire into workspace vitest config**

In root `vitest.workspace.ts`, add the tutorial project:
```ts
import { defineWorkspace } from 'vitest/config'
export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'docs/tutorial/vitest.config.ts',
])
```

- [ ] **Step 6: Run the full test suite**

```bash
pnpm install   # in case @oselvar/bdd-vitest is being symlinked freshly
pnpm test 2>&1 | tail -20
```

Expected output: the tutorial `Hello, BDD` example appears as a passing test (1 additional test). Total ~98 tests pass.

If the test fails:
- Check that the plugin's `load` hook is being invoked for `.bdd.md` files. Add a `console.error('plugin load:', id)` temporarily to debug, then remove before commit.
- The step files must be discovered. Check `loadBddConfig`'s default glob resolves them.
- The keyword `Given`/`Then` should be invisible to the matcher. Confirm via `bdd lint` once Plan 3's CLI lands; for now, the planner just produces hits via substring match.

- [ ] **Step 7: Commit**

```bash
git add bdd.config.ts docs/tutorial/ vitest.workspace.ts
git commit -m "feat(docs): first dogfooded tutorial — Hello, BDD"
```

---

## Task 9: Build verification + full check

**Files:**
- (no source changes — verifies the full system)

- [ ] **Step 1: Build all packages**

```bash
pnpm build 2>&1 | tail -10
```

Expected: both `@oselvar/bdd` and `@oselvar/bdd-vitest` build with no errors.

- [ ] **Step 2: Run the full check**

```bash
pnpm check 2>&1 | tail -20
```

Expected: lint, tests, knip, jscpd all pass.

- [ ] **Step 3: Sanity-check the dogfooded tutorial output**

```bash
pnpm test 2>&1 | grep -E "(Hello, BDD|tests)"
```

Expected: see "Hello, BDD" listed as a passing test.

- [ ] **Step 4: No commit if no changes**

If anything had to change to make the build green, commit it with `chore: verify vitest adapter build pipeline`.

---

## Plan summary

After Plan 2, the project has its first end-to-end loop: author writes markdown + step files, `pnpm test` discovers and runs them via the vitest adapter, the docs are alive. The core stays pure; the adapter holds all the I/O.

**Out of scope (carried forward):**

| Capability | Comes in |
|---|---|
| HMR (live reload on step-file changes) | Plan 2b |
| `bdd run` standalone CLI / node:test adapter | Plan 3 |
| `bdd stepdef` snippet CLI | Plan 3 |
| `bdd lint` for orphan/missing-step CI use | Plan 3 |
| Bun adapter | Plan 4 |
| Deno adapter + CI matrix | Plan 5 |
| Tags + tag filter | v1.2 |
| VSCode/LSP | v1.3 |
