# Unified `var.config.json` Implementation Plan (Sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three per-language config formats (`var.config.ts`, `pyproject.toml [tool.var]`, Java `var.vars.*` properties) with one JSON file, `var.config.json`, read by a thin config package in each port and proven identical by shared conformance fixtures.

**Architecture:** A language-neutral contract lives in `conformance/config/` (JSON Schema + fixture cases + canonical-JSON goldens). Each port keeps its public `VarConfig` type but sources it from `var.config.json`: TypeScript rewrites `@oselvar/var-config` (plugin names resolve to functions via a new var-core registry), Python gets a new `var_config` uv package, Java gets a new `var-config` Maven module with a hand-rolled JSON parser (repo has zero JSON deps, by design). Spec: `doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (Sub-project A).

**Tech Stack:** TypeScript strict/ESM (pnpm, vitest, biome), Python ≥3.11 (uv, pytest, ruff, hatchling), Java 21 (Maven, JUnit Jupiter). No new third-party dependencies in any port.

## Global Constraints

- Run all pnpm/vitest/tsc commands from `typescript/`; all uv commands from `python/`; all mvn commands from `java/`.
- `pnpm -r build` type-checks `src/` only; `pnpm typecheck` (part of `pnpm check`) type-checks `tests/`. Run both before calling a TS task done.
- Biome style: single quotes, no semicolons, 2-space indent, trailing commas, `import type` for type-only imports, `node:` protocol for built-ins.
- Immutable types everywhere: `readonly` fields, `ReadonlyArray`, frozen dataclasses, `List.copyOf`/`Map.copyOf`.
- Pure functions for parsing; file I/O only at the load edge.
- Config semantics (from the spec): all keys optional; missing file or missing key = empty (NO default steps glob anymore); malformed JSON, wrong types, or unknown keys fail loudly with file path + reason; a `$schema` key is allowed and ignored.
- Snippet map keys are unrestricted strings (schema and readers agree); known ids today: `typescript`, `python`, `java`, `kotlin`.
- Canonical JSON (all ports already have a helper): recursively sorted keys, 2-space indent, LF, trailing newline, non-ASCII raw. TS: `canonicalStringify` from `@oselvar/var-core` (src/conformance.ts:121). Python: `var_core.canonical_json.canonical_stringify`. Java: `com.oselvar.var.core.CanonicalJson.canonicalStringify` (public static).
- Trunk-based: each task lands green (its port's gate passes) before the next.

---

### Task 1: Language-neutral config contract (`conformance/config/`)

**Files:**
- Create: `conformance/config/var.config.schema.json`
- Create: `conformance/config/cases/full/var.config.json`, `conformance/config/cases/full/golden.json`
- Create: `conformance/config/cases/minimal/var.config.json`, `conformance/config/cases/minimal/golden.json`
- Create: `conformance/config/cases/empty-object/var.config.json`, `conformance/config/cases/empty-object/golden.json`
- Create: `conformance/config/cases/no-config-file/golden.json` (deliberately NO var.config.json in this dir)
- Create: `conformance/config/cases/invalid-json/var.config.json`, `conformance/config/cases/invalid-json/expect-error.txt`
- Create: `conformance/config/cases/wrong-type/var.config.json`, `conformance/config/cases/wrong-type/expect-error.txt`
- Create: `conformance/config/cases/unknown-key/var.config.json`, `conformance/config/cases/unknown-key/expect-error.txt`
- Create: `conformance/config/README.md`

**Interfaces:**
- Produces: the harness rule every port's conformance test (Tasks 3, 6, 7) implements: *for each directory under `conformance/config/cases/`: if `expect-error.txt` exists, loading `var.config.json` from that directory MUST fail; otherwise load (a missing `var.config.json` is legal and yields the empty config), project the parsed config to the artifact shape below, canonical-stringify it, and compare byte-for-byte with `golden.json`.*
- Artifact shape (language-neutral, plugin NAMES not functions): `{ "docs": { "include": [...], "exclude": [...] }, "steps": [...], "snippets": {...}, "scannerPlugins": [...] }`.

- [ ] **Step 1: Write the JSON Schema**

`conformance/config/var.config.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://oselvar.com/var.config.schema.json",
  "title": "Var configuration (var.config.json)",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "docs": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "include": { "type": "array", "items": { "type": "string" } },
        "exclude": { "type": "array", "items": { "type": "string" } }
      }
    },
    "steps": { "type": "array", "items": { "type": "string" } },
    "snippets": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "scannerPlugins": { "type": "array", "items": { "type": "string" } }
  }
}
```

- [ ] **Step 2: Write the success-case fixtures and goldens**

`conformance/config/cases/full/var.config.json`:

```json
{
  "docs": { "include": ["specs/**/*.md", "docs/**/*.md"], "exclude": ["specs/wip/**"] },
  "steps": ["steps/**/*.steps.ts", "steps/**/*_steps.py"],
  "snippets": { "typescript": "// {{expression}}", "python": "# {{expression}}" },
  "scannerPlugins": ["gherkinTables", "gherkinDocStrings"]
}
```

`conformance/config/cases/full/golden.json` (canonical: sorted keys, 2-space indent, trailing newline):

```json
{
  "docs": {
    "exclude": [
      "specs/wip/**"
    ],
    "include": [
      "specs/**/*.md",
      "docs/**/*.md"
    ]
  },
  "scannerPlugins": [
    "gherkinTables",
    "gherkinDocStrings"
  ],
  "snippets": {
    "python": "# {{expression}}",
    "typescript": "// {{expression}}"
  },
  "steps": [
    "steps/**/*.steps.ts",
    "steps/**/*_steps.py"
  ]
}
```

`conformance/config/cases/minimal/var.config.json`:

```json
{
  "docs": { "include": ["**/*.md"] }
}
```

`conformance/config/cases/minimal/golden.json`:

```json
{
  "docs": {
    "exclude": [],
    "include": [
      "**/*.md"
    ]
  },
  "scannerPlugins": [],
  "snippets": {},
  "steps": []
}
```

`conformance/config/cases/empty-object/var.config.json`:

```json
{}
```

`conformance/config/cases/empty-object/golden.json` and `conformance/config/cases/no-config-file/golden.json` (identical content — empty config):

```json
{
  "docs": {
    "exclude": [],
    "include": []
  },
  "scannerPlugins": [],
  "snippets": {},
  "steps": []
}
```

- [ ] **Step 3: Write the error-case fixtures**

`conformance/config/cases/invalid-json/var.config.json` (truncated JSON, exactly this content):

```
{ "docs": { "include": ["**/*.md"
```

`conformance/config/cases/invalid-json/expect-error.txt`:

```
invalid JSON
```

`conformance/config/cases/wrong-type/var.config.json`:

```json
{ "steps": "not-an-array" }
```

`conformance/config/cases/wrong-type/expect-error.txt`:

```
steps must be an array of strings
```

`conformance/config/cases/unknown-key/var.config.json` (the old key name — a deliberate migration tripwire):

```json
{ "vars": { "include": ["**/*.md"] } }
```

`conformance/config/cases/unknown-key/expect-error.txt`:

```
unknown key
```

Note: `expect-error.txt` content is documentation for humans; harnesses only assert *that* loading fails, not the message (error text is host-language-shaped).

There is deliberately NO unknown-plugin-name conformance case: `scannerPlugins` entries are opaque names at parse time in every port (Python/Java never resolve them), so an unknown name is not a *parse* error anywhere. TypeScript's load-time resolution rejects unknown names — covered by a var-config unit test in Task 3, not by this corpus.

- [ ] **Step 4: Write the README**

`conformance/config/README.md`:

```markdown
# Config conformance corpus

Language-neutral fixtures for `var.config.json` readers. Every port's config
package must implement the same harness rule over `cases/`:

- If a case directory contains `expect-error.txt`, loading `var.config.json`
  from that directory MUST fail (any error type; the txt file documents why
  for humans and is not asserted against).
- Otherwise, load the config (a missing `var.config.json` — see
  `no-config-file/` — is legal and yields the empty config), project it to
  `{ docs: { include, exclude }, steps, snippets, scannerPlugins }` with
  scanner-plugin NAMES (strings, never resolved functions), serialize with
  the port's canonical-JSON helper, and compare byte-for-byte against
  `golden.json`.

`var.config.schema.json` is the machine-readable schema (reference it from a
config file via `"$schema"` for editor validation). Readers enforce the same
rules in code: unknown keys, wrong types, and malformed JSON fail loudly with
the file path and reason; all keys are optional and default to empty.
```

- [ ] **Step 5: Commit**

```bash
git add conformance/config
git commit -m "feat(conformance): language-neutral var.config.json contract + fixtures"
```

---

### Task 2: Scanner-plugin name registry in `@oselvar/var-core`

**Files:**
- Create: `typescript/packages/var-core/src/plugins/registry.ts`
- Modify: `typescript/packages/var-core/src/index.ts` (add export)
- Test: `typescript/packages/var-core/tests/plugin-registry.test.ts`

**Interfaces:**
- Consumes: `gherkinTables`, `gherkinDocStrings` from `typescript/packages/var-core/src/plugins/gherkin/index.js`; `ScannerPlugin` type from `../scanner.js`.
- Produces: `resolveScannerPlugins(names: ReadonlyArray<string>): ReadonlyArray<ScannerPlugin>` exported from `@oselvar/var-core` — throws `Error` naming the unknown plugin and listing known names. Used by Task 3 (`loadVarConfig`) and Task 4 (generated vitest virtual module).

- [ ] **Step 1: Write the failing test**

`typescript/packages/var-core/tests/plugin-registry.test.ts`:

```ts
import { expect, test } from 'vitest'
import { resolveScannerPlugins } from '../src/plugins/registry.js'

test('resolves known plugin names to ScannerPlugin instances', () => {
  const plugins = resolveScannerPlugins(['gherkinTables', 'gherkinDocStrings'])
  expect(plugins.map((p) => p.name)).toEqual(['gherkin/tables', 'gherkin/doc-strings'])
})

test('empty names resolve to an empty list', () => {
  expect(resolveScannerPlugins([])).toEqual([])
})

test('an unknown name throws, naming the plugin and the known names', () => {
  expect(() => resolveScannerPlugins(['gherkinTables', 'nope'])).toThrowError(
    /unknown scanner plugin "nope".*gherkinTables.*gherkinDocStrings/i,
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `typescript/`): `pnpm --filter @oselvar/var-core exec vitest run tests/plugin-registry.test.ts`
Expected: FAIL — cannot resolve `../src/plugins/registry.js`.

- [ ] **Step 3: Write the implementation**

`typescript/packages/var-core/src/plugins/registry.ts`:

```ts
import type { ScannerPlugin } from '../scanner.js'
import { gherkinDocStrings, gherkinTables } from './gherkin/index.js'

// var.config.json carries scanner plugins as NAME STRINGS (the config is
// shared with the Python/Java/Kotlin ports, which resolve the same names
// against their own implementations). This is the TypeScript resolution
// table. Fixed to the built-ins for now; third-party plugins are out of
// scope (see doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md).
const REGISTRY: Readonly<Record<string, () => ScannerPlugin>> = {
  gherkinTables,
  gherkinDocStrings,
}

export function resolveScannerPlugins(
  names: ReadonlyArray<string>,
): ReadonlyArray<ScannerPlugin> {
  return names.map((name) => {
    const factory = REGISTRY[name]
    if (!factory) {
      throw new Error(
        `Unknown scanner plugin "${name}" — known plugins: ${Object.keys(REGISTRY).join(', ')}`,
      )
    }
    return factory()
  })
}
```

Add to `typescript/packages/var-core/src/index.ts`, next to the existing line 76 `export { gherkinDocStrings, gherkinTables } from './plugins/gherkin/index.js'`:

```ts
export { resolveScannerPlugins } from './plugins/registry.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oselvar/var-core exec vitest run tests/plugin-registry.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Build gates and commit**

Run: `pnpm -r build && pnpm typecheck` — both exit 0.

```bash
git add typescript/packages/var-core/src/plugins/registry.ts typescript/packages/var-core/src/index.ts typescript/packages/var-core/tests/plugin-registry.test.ts
git commit -m "feat(var-core): resolveScannerPlugins name registry for JSON config"
```

---

### Task 3: Rewrite `@oselvar/var-config` to read `var.config.json`

**Files:**
- Modify: `typescript/packages/var-config/src/config-types.ts` (full rewrite)
- Modify: `typescript/packages/var-config/src/config.ts` (full rewrite)
- Modify: `typescript/packages/var-config/src/index.ts`
- Rewrite: `typescript/packages/var-config/tests/config.test.ts`
- Create: `typescript/packages/var-config/tests/config-conformance.test.ts`

**Interfaces:**
- Consumes: `resolveScannerPlugins`, `canonicalStringify`, `ScannerPlugin` from `@oselvar/var-core` (Task 2).
- Produces (relied on by Tasks 4–5):
  - `type VarGlobs = { readonly include: ReadonlyArray<string>; readonly exclude: ReadonlyArray<string> }` (unchanged)
  - `type ParsedVarConfig = { readonly docs: VarGlobs; readonly steps: ReadonlyArray<string>; readonly snippets: Readonly<Record<string, string>>; readonly scannerPlugins: ReadonlyArray<string> }` — plugin NAMES, pure data
  - `type VarConfig = { readonly docs: VarGlobs; readonly steps: ReadonlyArray<string>; readonly snippets: Readonly<Record<string, string>>; readonly scannerPlugins: ReadonlyArray<ScannerPlugin>; readonly scannerPluginNames: ReadonlyArray<string> }` — the resolved config consumers use. NOTE: `vars` is GONE (renamed `docs`), `snippet.template` is GONE (replaced by `snippets` map), there is NO default steps glob.
  - `parseVarConfig(jsonText: string, sourcePath: string): ParsedVarConfig` — pure; throws `Error` whose message starts with `sourcePath` on malformed JSON, wrong types, or unknown keys; `$schema` is allowed and ignored.
  - `loadVarConfig(cwd: string): Promise<VarConfig>` — reads `<cwd>/var.config.json` if present (missing file = empty config), parses, resolves plugin names.
  - `findFiles` re-exported unchanged.

- [ ] **Step 1: Rewrite the types**

`typescript/packages/var-config/src/config-types.ts`:

```ts
import type { ScannerPlugin } from '@oselvar/var-core'

// Spec-doc discovery globs. `include` is globbed; anything also matching
// `exclude` is dropped. Both are plain globs — no `!` prefix semantics.
export type VarGlobs = {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

// The parsed, unresolved shape of var.config.json — pure data, shared
// byte-for-byte with the Python/Java/Kotlin readers (see
// conformance/config/README.md). Scanner plugins are NAMES here.
export type ParsedVarConfig = {
  readonly docs: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippets: Readonly<Record<string, string>>
  readonly scannerPlugins: ReadonlyArray<string>
}

// The resolved config consumers receive: plugin names looked up against
// var-core's registry. `scannerPluginNames` is kept alongside the resolved
// instances because the vitest plugin generates source code and needs the
// names to re-resolve inside the generated module.
export type VarConfig = {
  readonly docs: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippets: Readonly<Record<string, string>>
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
  readonly scannerPluginNames: ReadonlyArray<string>
}
```

- [ ] **Step 2: Write the failing unit tests**

Replace `typescript/packages/var-config/tests/config.test.ts` entirely:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadVarConfig, parseVarConfig } from '../src/config.js'

test('parseVarConfig reads all four keys', () => {
  const parsed = parseVarConfig(
    `{
      "docs": { "include": ["specs/**/*.md"], "exclude": ["specs/wip/**"] },
      "steps": ["**/*.steps.ts"],
      "snippets": { "typescript": "T" },
      "scannerPlugins": ["gherkinTables"]
    }`,
    'var.config.json',
  )
  expect(parsed).toEqual({
    docs: { include: ['specs/**/*.md'], exclude: ['specs/wip/**'] },
    steps: ['**/*.steps.ts'],
    snippets: { typescript: 'T' },
    scannerPlugins: ['gherkinTables'],
  })
})

test('all keys are optional and default to empty; $schema is ignored', () => {
  const parsed = parseVarConfig('{ "$schema": "https://x/y.json" }', 'var.config.json')
  expect(parsed).toEqual({
    docs: { include: [], exclude: [] },
    steps: [],
    snippets: {},
    scannerPlugins: [],
  })
})

test('malformed JSON throws with the source path in the message', () => {
  expect(() => parseVarConfig('{ nope', '/w/var.config.json')).toThrowError(
    /^\/w\/var\.config\.json/,
  )
})

test('an unknown top-level key throws (migration tripwire for the old "vars" key)', () => {
  expect(() => parseVarConfig('{ "vars": {} }', 'var.config.json')).toThrowError(
    /unknown key.*"vars"/i,
  )
})

test('a wrong-typed value throws naming the key', () => {
  expect(() => parseVarConfig('{ "steps": "x" }', 'var.config.json')).toThrowError(/steps/)
  expect(() => parseVarConfig('{ "docs": [] }', 'var.config.json')).toThrowError(/docs/)
  expect(() => parseVarConfig('{ "snippets": { "typescript": 1 } }', 'var.config.json')).toThrowError(
    /snippets/,
  )
})

test('loadVarConfig resolves plugin names and keeps the names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-'))
  try {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"] }, "scannerPlugins": ["gherkinTables"] }\n',
    )
    const cfg = await loadVarConfig(dir)
    expect(cfg.docs).toEqual({ include: ['**/*.md'], exclude: [] })
    expect(cfg.steps).toEqual([])
    expect(cfg.scannerPluginNames).toEqual(['gherkinTables'])
    expect(cfg.scannerPlugins.map((p) => p.name)).toEqual(['gherkin/tables'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing var.config.json yields the empty config (no default steps glob)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-none-'))
  try {
    const cfg = await loadVarConfig(dir)
    expect(cfg.docs).toEqual({ include: [], exclude: [] })
    expect(cfg.steps).toEqual([])
    expect(cfg.snippets).toEqual({})
    expect(cfg.scannerPlugins).toEqual([])
    expect(cfg.scannerPluginNames).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadVarConfig rejects an unknown plugin name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-badplugin-'))
  try {
    writeFileSync(join(dir, 'var.config.json'), '{ "scannerPlugins": ["nope"] }\n')
    await expect(loadVarConfig(dir)).rejects.toThrowError(/unknown scanner plugin "nope"/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Write the failing conformance test**

`typescript/packages/var-config/tests/config-conformance.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalStringify } from '@oselvar/var-core'
import { expect, test } from 'vitest'
import { parseVarConfig } from '../src/config.js'

// tests/ -> var-config -> packages -> typescript -> repo root. (import.meta.url,
// not __dirname — this is an ESM package and vitest runs test files as ESM.)
const CASES_DIR = fileURLToPath(
  new URL('../../../../conformance/config/cases', import.meta.url),
)

const EMPTY = { docs: { include: [], exclude: [] }, steps: [], snippets: {}, scannerPlugins: [] }

for (const name of readdirSync(CASES_DIR).sort()) {
  const dir = join(CASES_DIR, name)
  const configPath = join(dir, 'var.config.json')
  if (existsSync(join(dir, 'expect-error.txt'))) {
    test(`config conformance: ${name} fails to parse`, () => {
      expect(() => parseVarConfig(readFileSync(configPath, 'utf8'), configPath)).toThrowError()
    })
  } else {
    test(`config conformance: ${name} matches golden`, () => {
      const parsed = existsSync(configPath)
        ? parseVarConfig(readFileSync(configPath, 'utf8'), configPath)
        : EMPTY
      const actual = canonicalStringify({
        docs: { include: parsed.docs.include, exclude: parsed.docs.exclude },
        steps: parsed.steps,
        snippets: parsed.snippets,
        scannerPlugins: parsed.scannerPlugins,
      })
      expect(actual).toBe(readFileSync(join(dir, 'golden.json'), 'utf8'))
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @oselvar/var-config exec vitest run`
Expected: FAIL — `parseVarConfig` is not exported.

- [ ] **Step 5: Rewrite the loader**

`typescript/packages/var-config/src/config.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveScannerPlugins } from '@oselvar/var-core'
import type { ParsedVarConfig, VarConfig, VarGlobs } from './config-types.js'

export type { ParsedVarConfig, VarConfig, VarGlobs } from './config-types.js'

const EMPTY_PARSED: ParsedVarConfig = {
  // No default docs OR steps globs: a repo must declare both explicitly.
  // (The old TS-only `**/*.steps.ts` steps default died with the TS-only
  // format — var.config.json is shared with the Python/Java/Kotlin ports.)
  docs: { include: [], exclude: [] },
  steps: [],
  snippets: {},
  scannerPlugins: [],
}

const KNOWN_KEYS = new Set(['$schema', 'docs', 'steps', 'snippets', 'scannerPlugins'])
const KNOWN_DOCS_KEYS = new Set(['include', 'exclude'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringArray(value: unknown, key: string, sourcePath: string): ReadonlyArray<string> {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`${sourcePath}: "${key}" must be an array of strings`)
  }
  return value
}

// Pure. Parses the var.config.json TEXT (no filesystem) so the conformance
// harness and loadVarConfig share one implementation. Fails loudly — a
// typo'd config that silently discovers nothing is the failure mode this
// refuses (see the design spec's error-handling section).
export function parseVarConfig(jsonText: string, sourcePath: string): ParsedVarConfig {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`${sourcePath}: invalid JSON: ${(e as Error).message}`)
  }
  if (!isRecord(data)) throw new Error(`${sourcePath}: top level must be an object`)
  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(
        `${sourcePath}: unknown key "${key}" (known keys: docs, steps, snippets, scannerPlugins)`,
      )
    }
  }
  let docs: VarGlobs = EMPTY_PARSED.docs
  if (data.docs !== undefined) {
    if (!isRecord(data.docs)) throw new Error(`${sourcePath}: "docs" must be an object`)
    for (const key of Object.keys(data.docs)) {
      if (!KNOWN_DOCS_KEYS.has(key)) {
        throw new Error(`${sourcePath}: unknown key "docs.${key}" (known: include, exclude)`)
      }
    }
    docs = {
      include: stringArray(data.docs.include, 'docs.include', sourcePath),
      exclude: stringArray(data.docs.exclude, 'docs.exclude', sourcePath),
    }
  }
  let snippets: Readonly<Record<string, string>> = {}
  if (data.snippets !== undefined) {
    if (
      !isRecord(data.snippets) ||
      !Object.values(data.snippets).every((v) => typeof v === 'string')
    ) {
      throw new Error(`${sourcePath}: "snippets" must be an object of strings`)
    }
    snippets = data.snippets as Record<string, string>
  }
  return {
    docs,
    steps: stringArray(data.steps, 'steps', sourcePath),
    snippets,
    scannerPlugins: stringArray(data.scannerPlugins, 'scannerPlugins', sourcePath),
  }
}

export async function loadVarConfig(cwd: string): Promise<VarConfig> {
  const path = resolve(cwd, 'var.config.json')
  const parsed = existsSync(path)
    ? parseVarConfig(readFileSync(path, 'utf8'), path)
    : EMPTY_PARSED
  return {
    docs: parsed.docs,
    steps: parsed.steps,
    snippets: parsed.snippets,
    scannerPlugins: resolveScannerPlugins(parsed.scannerPlugins),
    scannerPluginNames: parsed.scannerPlugins,
  }
}
```

(`loadVarConfig` stays `async` even though nothing awaits — every call site already awaits it, and keeping the signature avoids touching them all.)

Update `typescript/packages/var-config/src/index.ts`:

```ts
export { loadVarConfig, parseVarConfig } from './config.js'
export type { ParsedVarConfig, VarConfig, VarGlobs } from './config-types.js'
export { findFiles } from './find-files.js'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @oselvar/var-config exec vitest run`
Expected: all unit + conformance tests pass. (Other packages are still broken — that's Tasks 4–5.)

- [ ] **Step 7: Commit**

```bash
git add typescript/packages/var-config
git commit -m "feat(var-config): read var.config.json; docs/snippets keys; named plugins"
```

---

### Task 4: TypeScript consumers I — vitest plugin, CLI, repo config files

**Files:**
- Modify: `typescript/packages/var-vitest/src/plugin.ts`
- Modify: `typescript/packages/var-cli/src/lint.ts:26-28`, `typescript/packages/var-cli/src/run.ts:24-26`
- Modify: `typescript/packages/var-cli/src/init.ts`
- Modify: `typescript/packages/var-cli/tests/init.test.ts`
- Delete: `typescript/var.config.ts` → Create: `typescript/var.config.json`
- Delete: `typescript/packages/cucumber/var.config.ts` → Create: `typescript/packages/cucumber/var.config.json`
- Delete: `typescript/packages/var-cli/tests/fixtures/run-basic/var.config.ts` → Create: `.../run-basic/var.config.json`
- Modify (comments only, mechanical): `typescript/packages/cucumber/vitest.config.ts:5`, `typescript/packages/var-examples/vitest.config.ts:6-7`, `typescript/packages/var-language/src/index-workspace.ts:17` — change the words "var.config.ts" to "var.config.json".

**Interfaces:**
- Consumes: `VarConfig` (with `docs`, `scannerPluginNames`) and `loadVarConfig` from Task 3; `resolveScannerPlugins` from Task 2 (inside generated code).
- Produces: `generateVirtualModule` signature change — `configPath` field REPLACED by `scannerPluginNames: ReadonlyArray<string>` in `GenerateInput`. Task 5 does not depend on this, but any test of `generateVirtualModule` in var-vitest's own tests must be updated to match.

- [ ] **Step 1: Migrate the three config files**

`typescript/var.config.json`:

```json
{
  "$schema": "../conformance/config/var.config.schema.json",
  "docs": {
    "include": ["packages/var-examples/**/*.md"],
    "exclude": ["packages/var-examples/yahtzee/yahtzee.broken.md"]
  },
  "steps": ["packages/var-examples/**/*.steps.ts"]
}
```

`typescript/packages/cucumber/var.config.json` (the plugin functions become names):

```json
{
  "$schema": "../../../conformance/config/var.config.schema.json",
  "docs": { "include": ["features/**/*.feature"], "exclude": [] },
  "steps": ["steps/**/*.steps.ts"],
  "scannerPlugins": ["gherkinTables", "gherkinDocStrings"]
}
```

`typescript/packages/var-cli/tests/fixtures/run-basic/var.config.json`:

```json
{
  "docs": { "include": ["*.md"], "exclude": [] },
  "steps": ["*.steps.ts"]
}
```

Delete the three `.ts` originals:

```bash
git rm typescript/var.config.ts typescript/packages/cucumber/var.config.ts typescript/packages/var-cli/tests/fixtures/run-basic/var.config.ts
```

- [ ] **Step 2: Update the vitest plugin**

In `typescript/packages/var-vitest/src/plugin.ts`:

- In `config()`: `cfg.vars.include` → `cfg.docs.include`, `cfg.vars.exclude` → `cfg.docs.exclude` (lines 49-50); update the comment on lines 32-37 to say `var.config.json`.
- In `configResolved()`: `cfg.vars.include, cfg.vars.exclude` → `cfg.docs.include, cfg.docs.exclude` (line 57); DELETE the `configPath` probe loop (lines 58-64) and the `let configPath` declaration (lines 26-28); instead capture `pluginNames = cfg.scannerPluginNames`.
- In `load()`: pass `scannerPluginNames: pluginNames` instead of `configPath`.
- Replace `GenerateInput`'s `configPath` field and the config-import codegen:

```ts
export type GenerateInput = {
  readonly varPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
  // Scanner-plugin NAMES from var.config.json. The generated module
  // re-resolves them via var-core's registry — functions can't be
  // serialized into generated source, names can.
  readonly scannerPluginNames: ReadonlyArray<string>
}
```

In `generateVirtualModule`, delete the `configImport` const; add the names to the generated source:

```ts
export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const stepImports = input.stepImports.map((p) => `import ${JSON.stringify(p)}`).join('\n')
  const pathJson = JSON.stringify(input.varPath)
  const pluginNamesJson = JSON.stringify(input.scannerPluginNames)
  return `import { test as vitestTest } from 'vitest'
import { resolveScannerPlugins } from '@oselvar/var-core'
import { runVarSource, toFailure } from '@oselvar/var-vitest/runtime'
${stepImports}
...
  scannerPlugins: resolveScannerPlugins(${pluginNamesJson}),
})
`
}
```

(The `...` above stands for the existing `SOURCE`/`PATH`/`runVarSource` body, unchanged except the final `scannerPlugins:` line shown. Keep it verbatim from the current file.)

- [ ] **Step 3: Update the CLI**

`typescript/packages/var-cli/src/lint.ts` line 26-28 and `run.ts` line 24-26: `cfg.vars` → `cfg.docs` (the local variable can stay named `varGlobs`).

`typescript/packages/var-cli/src/init.ts`: replace the `CONFIG` constant and the scaffold entry:

```ts
const CONFIG = `{
  "docs": { "include": ["var-examples/**/*.md"], "exclude": [] },
  "steps": ["var-examples/**/*.steps.ts"]
}
`
```

and in the `files` array: `{ relPath: 'var.config.json', content: CONFIG },`.

`typescript/packages/var-cli/tests/init.test.ts`: change both `var.config.ts` expectations to `var.config.json` (the existence assertion in the first test, and the overwrite-refusal fixture + assertions in the second — write `'{ "docs": { "include": [] } }'` as the pre-existing file content instead of `'/* mine */'`, and assert it survives byte-for-byte).

- [ ] **Step 4: Run the affected suites**

Run: `pnpm --filter @oselvar/var-vitest exec vitest run && pnpm --filter @oselvar/var-cli exec vitest run && pnpm --filter ./packages/cucumber test` (the cucumber package is filtered by directory — don't guess its package name)
Expected: PASS. If var-vitest has tests asserting the old `configPath` codegen, update them to assert `resolveScannerPlugins([...])` appears in generated source instead.

- [ ] **Step 5: Verify the dogfood suite still collects specs**

Run: `NODE_OPTIONS="--import tsx" npx vitest run` (from `typescript/`)
Expected: the var-examples specs run exactly as before (same test count as a pre-change run; `yahtzee.broken.md` still excluded).

- [ ] **Step 6: Commit**

```bash
git add -A typescript
git commit -m "feat(typescript): consume var.config.json in vitest plugin, CLI, and repo configs"
```

---

### Task 5: TypeScript consumers II — LSP, VS Code, website workers, docs

**Files:**
- Modify: `typescript/packages/var-lsp/src/store.ts` (lines 52-53, 68-72)
- Modify: `typescript/packages/var-lsp/src/store.test.ts`, `typescript/packages/var-lsp/tests/handlers.test.ts` (fixture sweep)
- Modify: `typescript/packages/var-vscode/package.json:21` (activation event)
- Modify: `typescript/packages/website/src/lib/var-worker.ts:33-37`, `typescript/packages/website/src/lib/var-worker.ts:11-15`
- Modify: `typescript/knip.json:49`, `typescript/tsconfig.tests.json` (drop var.config.ts references)
- Modify: `CLAUDE.md` (3 references), `typescript/packages/cucumber/README.md:38,82`, `typescript/packages/website/src/content/docs/guides/install-var.md:32,37`

**Interfaces:**
- Consumes: `VarConfig` shape from Task 3 (`docs`, `snippets`, `scannerPluginNames`).
- Produces: no new interfaces. `store.snippetTemplate()` keeps its name and `string | undefined` return, now backed by `config.snippets['typescript']` (sub-project D generalizes it per-language).

- [ ] **Step 1: Update the LSP store**

In `typescript/packages/var-lsp/src/store.ts`:
- Line 53: `fs.list(config.vars)` → `fs.list(config.docs)`
- Line 68: `snippetTemplate: () => config.snippet.template` → `snippetTemplate: () => config.snippets.typescript`
- Line 72: `fs.matches(path, config.vars)` → `fs.matches(path, config.docs)` (update the adjacent comments from "vars globs" to "docs globs")

- [ ] **Step 2: Sweep the LSP test fixtures**

In `typescript/packages/var-lsp/tests/handlers.test.ts` (23 occurrences) and `typescript/packages/var-lsp/src/store.test.ts`: replace every config-fixture write. The dominant pattern:

```ts
writeFileSync(join(dir, 'var.config.ts'), "export default { vars: ['**/*.md'] }\n")
```

becomes

```ts
writeFileSync(
  join(dir, 'var.config.json'),
  '{ "docs": { "include": ["**/*.md"], "exclude": [] }, "steps": ["**/*.steps.ts"] }\n',
)
```

CRITICAL: the old fixtures relied on the now-deleted default steps glob (`**/*.steps.ts`) — every migrated fixture MUST declare `"steps"` explicitly or its step files silently stop being discovered. Apply the same mapping to every variant (different globs map positionally: `vars: [X]` → `"docs": { "include": [X], "exclude": [] }`; explicit `vars: { include, exclude }` maps key-for-key). In `store.test.ts`, config object literals change shape: `vars:` → `docs:`, `snippet: { template: T }` → `snippets: { typescript: T }`, and add `scannerPluginNames: []` next to the existing `scannerPlugins: []`.

- [ ] **Step 3: Update VS Code activation and the browser workers**

`typescript/packages/var-vscode/package.json` line 21: `"workspaceContains:**/var.config.ts"` → `"workspaceContains:**/var.config.json"`.

In both `typescript/packages/website/src/lib/var-worker.ts` and `typescript/packages/website/src/lib/var-worker.ts`, the hardcoded config literal becomes:

```ts
const config = {
  docs: { include: ['**/*.md'], exclude: [] },
  steps: ['**/*.steps.ts'],
  snippets: { typescript: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
  scannerPluginNames: [],
}
```

- [ ] **Step 4: Update tooling config and docs**

- `typescript/knip.json` line 49: change the `var.config.ts` ignore entry to `var.config.json` (or delete it if knip no longer flags anything — run `pnpm knip` to confirm).
- `typescript/tsconfig.tests.json`: remove the `var.config.ts` include entries and comment (JSON needs no type-checking).
- `CLAUDE.md`: update the three references — line 51 ("`var.config.ts` globs them" → "`var.config.json` globs them"), line 57 ("matches the `vars` globs in `var.config.ts`" → "matches the `docs` globs in `var.config.json`"), line 64 ("Config: `var.config.ts`" → "Config: `var.config.json`"). Also update the Conventions bullet describing `vars` `{ include, exclude }` to say `docs`.
- `typescript/packages/cucumber/README.md` lines 38, 82: show the JSON config with `"scannerPlugins": ["gherkinTables", "gherkinDocStrings"]` instead of the TS import + function calls.
- `typescript/packages/website/src/content/docs/guides/install-var.md` lines 32, 37: scaffold output now lists `var.config.json`; show the JSON shape.

- [ ] **Step 5: Run the full TypeScript gate**

Run (from `typescript/`): `pnpm check`
Expected: exit 0 — biome, `pnpm -r build`, `pnpm typecheck`, knip, jscpd, and every package's vitest suite all green. Also run `pnpm --filter @oselvar/website build` (Astro has its own build).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(typescript): var.config.json in LSP, VS Code, website workers; docs sweep"
```

---

### Task 6: Python — new `var_config` package, consumers migrated

**Files:**
- Create: `python/packages/var-config/pyproject.toml`
- Create: `python/packages/var-config/src/var_config/__init__.py`
- Create: `python/packages/var-config/src/var_config/config.py`
- Create: `python/packages/var-config/tests/test_config.py`
- Create: `python/packages/var-config/tests/test_conformance.py`
- Delete: `python/packages/var-runner/src/var_runner/config.py`, `python/packages/var-runner/tests/test_config.py`
- Modify: `python/packages/var-runner/src/var_runner/__init__.py`, `python/packages/var-runner/pyproject.toml`
- Modify: `python/packages/var-pytest/src/var_pytest/plugin.py:19-34`, `python/packages/var-pytest/pyproject.toml`
- Modify: `python/pyproject.toml` (workspace source + delete `[tool.var]`) → Create: `python/var.config.json`
- Modify: `python/packages/var-pytest/tests/test_collection.py`, `test_dogfood_bundles.py`, `test_async.py`, `test_fixtures.py`, `test_failures.py` (fixture sweep), `python/packages/var-runner/tests/test_public_api.py`, `python/README.md`

**Interfaces:**
- Consumes: `conformance/config/cases/` contract from Task 1; `var_core.canonical_json.canonical_stringify` (test-only).
- Produces: `var_config.VarConfig` frozen dataclass with fields `docs_include: tuple[str, ...]`, `docs_exclude: tuple[str, ...]`, `steps: tuple[str, ...]`, `snippets: Mapping[str, str]`, `scanner_plugins: tuple[str, ...]`; `var_config.read_var_config(root: str | Path) -> VarConfig` reading `<root>/var.config.json` (missing file → `VarConfig()`; malformed/invalid → `ValueError` starting with the file path). `var_runner` re-exports both names so its public API is unchanged.

- [ ] **Step 1: Create the package skeleton**

`python/packages/var-config/pyproject.toml`:

```toml
[project]
name = "oselvar-var-config"
version = "0.0.0"
description = "Reads var.config.json — the shared config file for all var tools"
requires-python = ">=3.11"
dependencies = []

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var_config"]
```

`python/packages/var-config/src/var_config/__init__.py`:

```python
from var_config.config import VarConfig, read_var_config

__all__ = ["VarConfig", "read_var_config"]
```

In `python/pyproject.toml`, add to `[tool.uv.sources]`:

```toml
oselvar-var-config = { workspace = true }
```

- [ ] **Step 2: Write the failing tests**

`python/packages/var-config/tests/test_config.py`:

```python
import pytest

from var_config import VarConfig, read_var_config


def _write(tmp_path, body: str):
    (tmp_path / "var.config.json").write_text(body, encoding="utf-8")
    return tmp_path


def test_reads_all_keys(tmp_path):
    root = _write(
        tmp_path,
        '{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},'
        ' "steps": ["**/*_steps.py"], "snippets": {"python": "P"},'
        ' "scannerPlugins": ["gherkinTables"]}',
    )
    cfg = read_var_config(root)
    assert cfg.docs_include == ("a/**/*.md",)
    assert cfg.docs_exclude == ("a/wip/**",)
    assert cfg.steps == ("**/*_steps.py",)
    assert cfg.snippets == {"python": "P"}
    assert cfg.scanner_plugins == ("gherkinTables",)


def test_missing_file_is_empty_config(tmp_path):
    assert read_var_config(tmp_path / "nowhere") == VarConfig()


def test_all_keys_optional_and_schema_key_ignored(tmp_path):
    root = _write(tmp_path, '{"$schema": "https://x/y.json"}')
    assert read_var_config(root) == VarConfig()


def test_malformed_json_raises_with_path(tmp_path):
    root = _write(tmp_path, "{ nope")
    with pytest.raises(ValueError, match=r"var\.config\.json.*invalid JSON"):
        read_var_config(root)


def test_unknown_key_raises(tmp_path):
    root = _write(tmp_path, '{"vars": {}}')
    with pytest.raises(ValueError, match="unknown key"):
        read_var_config(root)


def test_wrong_type_raises(tmp_path):
    root = _write(tmp_path, '{"steps": "x"}')
    with pytest.raises(ValueError, match="steps"):
        read_var_config(root)
```

`python/packages/var-config/tests/test_conformance.py`:

```python
"""Config conformance: every case in conformance/config/cases must parse to
the shared golden (byte-for-byte via canonical JSON) or fail if the case has
an expect-error.txt marker. See conformance/config/README.md."""

from pathlib import Path

import pytest
from var_core.canonical_json import canonical_stringify

from var_config import read_var_config

# python/packages/var-config/tests -> parents[4] = repo root
CASES_DIR = Path(__file__).resolve().parents[4] / "conformance" / "config" / "cases"
CASES = sorted(p for p in CASES_DIR.iterdir() if p.is_dir())


def _artifact(cfg) -> dict:
    return {
        "docs": {"include": list(cfg.docs_include), "exclude": list(cfg.docs_exclude)},
        "steps": list(cfg.steps),
        "snippets": dict(cfg.snippets),
        "scannerPlugins": list(cfg.scanner_plugins),
    }


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.name)
def test_config_case(case: Path) -> None:
    if (case / "expect-error.txt").exists():
        with pytest.raises(ValueError):
            read_var_config(case)
    else:
        actual = canonical_stringify(_artifact(read_var_config(case)))
        expected = (case / "golden.json").read_text(encoding="utf-8")
        assert actual == expected
```

Run (from `python/`): `uv sync && uv run pytest packages/var-config`
Expected: FAIL — `var_config.config` doesn't exist yet. (`var_core` is importable in tests because pytest runs across the whole uv workspace.)

- [ ] **Step 3: Implement the reader**

`python/packages/var-config/src/var_config/config.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

_KNOWN_KEYS = {"$schema", "docs", "steps", "snippets", "scannerPlugins"}
_KNOWN_DOCS_KEYS = {"include", "exclude"}


@dataclass(frozen=True, slots=True)
class VarConfig:
    docs_include: tuple[str, ...] = ()
    docs_exclude: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    snippets: Mapping[str, str] = field(default_factory=dict)
    scanner_plugins: tuple[str, ...] = ()


def _string_tuple(value: object, key: str, path: Path) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError(f"{path}: '{key}' must be an array of strings")
    return tuple(value)


def read_var_config(root: str | Path) -> VarConfig:
    """Read ``<root>/var.config.json``.

    Missing file -> empty config (tools no-op; matches every other port).
    Malformed JSON, wrong types, or unknown keys -> ``ValueError`` starting
    with the file path — a typo'd config must fail loudly, never silently
    discover nothing. See conformance/config/README.md for the shared rules.
    """
    path = Path(root) / "var.config.json"
    if not path.is_file():
        return VarConfig()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"{path}: invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top level must be an object")
    unknown = set(data) - _KNOWN_KEYS
    if unknown:
        raise ValueError(f"{path}: unknown key(s): {', '.join(sorted(unknown))}")
    docs = data.get("docs") or {}
    if not isinstance(docs, dict):
        raise ValueError(f"{path}: 'docs' must be an object")
    unknown_docs = set(docs) - _KNOWN_DOCS_KEYS
    if unknown_docs:
        raise ValueError(f"{path}: unknown docs key(s): {', '.join(sorted(unknown_docs))}")
    snippets = data.get("snippets") or {}
    if not isinstance(snippets, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in snippets.items()
    ):
        raise ValueError(f"{path}: 'snippets' must be an object of strings")
    return VarConfig(
        docs_include=_string_tuple(docs.get("include"), "docs.include", path),
        docs_exclude=_string_tuple(docs.get("exclude"), "docs.exclude", path),
        steps=_string_tuple(data.get("steps"), "steps", path),
        snippets=dict(snippets),
        scanner_plugins=_string_tuple(data.get("scannerPlugins"), "scannerPlugins", path),
    )
```

Run: `uv run pytest packages/var-config` — expected: all pass, including the conformance cases from Task 1.

- [ ] **Step 4: Migrate the consumers**

- `python/packages/var-pytest/src/var_pytest/plugin.py`: change the import to `from var_config import read_var_config`; line 19 `read_var_config(root / "pyproject.toml")` → `read_var_config(root)`; line 34 `cfg.vars_include, cfg.vars_exclude` → `cfg.docs_include, cfg.docs_exclude`. Add `"oselvar-var-config"` to `python/packages/var-pytest/pyproject.toml` dependencies.
- `python/packages/var-runner/src/var_runner/__init__.py`: replace `from var_runner.config import VarConfig, read_var_config` with `from var_config import VarConfig, read_var_config` (keep both in `__all__` — public API unchanged). Add `"oselvar-var-config"` to `python/packages/var-runner/pyproject.toml` dependencies.
- Delete `python/packages/var-runner/src/var_runner/config.py` and `python/packages/var-runner/tests/test_config.py` (superseded by the var-config package's tests).
- `python/pyproject.toml`: delete the entire `[tool.var]` table; create `python/var.config.json` with the same six-bundle dogfood globs:

```json
{
  "$schema": "../conformance/config/var.config.schema.json",
  "docs": {
    "include": [
      "../conformance/bundles/01-roman-numerals/*.md",
      "../conformance/bundles/02-context-isolation/*.md",
      "../conformance/bundles/04-tables-and-docstrings/*.md",
      "../conformance/bundles/07-row-check-mismatch/*.md",
      "../conformance/bundles/08-string-capture/*.md",
      "../conformance/bundles/09-expected-message-mismatch/*.md"
    ],
    "exclude": []
  },
  "steps": [
    "../conformance/bundles/01-roman-numerals/*.steps.py",
    "../conformance/bundles/02-context-isolation/*.steps.py",
    "../conformance/bundles/04-tables-and-docstrings/*.steps.py",
    "../conformance/bundles/07-row-check-mismatch/*.steps.py",
    "../conformance/bundles/08-string-capture/*.steps.py",
    "../conformance/bundles/09-expected-message-mismatch/*.steps.py"
  ]
}
```

Move the collision-free-subset comment from `[tool.var]` into `python/pyproject.toml` next to where the table was (JSON has no comments), pointing at `var.config.json`.

- Fixture sweep in `python/packages/var-pytest/tests/` (`test_collection.py`, `test_dogfood_bundles.py`, `test_async.py`, `test_fixtures.py`, `test_failures.py`): each currently writes a `pyproject.toml` containing `[tool.var]\nvars = [...]\nsteps = [...]`. Replace each with writing `var.config.json` in the same temp root, mapping `vars = ["X"]` → `{"docs": {"include": ["X"], "exclude": []}, "steps": [...]}` (same values, JSON syntax). Where a test ALSO needs a `pyproject.toml` for pytest rootdir detection, keep a minimal one (`[project]` only) — the config just moves out of it.
- `python/packages/var-runner/tests/test_public_api.py`: imports still pass (re-export); update only if it asserts the defining module.
- `python/README.md` lines 26, 46, 50: replace the `[tool.var]` examples with the `var.config.json` equivalent.

- [ ] **Step 5: Run the Python gate**

Run (from `python/`): `uv sync && uv run pytest && uv run ruff check`
Expected: exit 0. Also verify the dogfood run still collects: `uv run pytest --rootdir=. ../conformance/bundles` behaves as documented (same pass/fail mix as before the change).

- [ ] **Step 6: Commit**

```bash
git add -A python
git commit -m "feat(python): var_config package reads var.config.json; [tool.var] removed"
```

(`git add -A python` includes the updated `python/uv.lock` — CI runs `uv sync --locked`, so the lockfile must be committed with the new workspace member.)

---

### Task 7: Java — new `var-config` module (JSON parser + `VarConfig` + conformance)

**Files:**
- Create: `java/var-config/pom.xml`
- Create: `java/var-config/src/main/java/com/oselvar/var/config/Json.java`
- Create: `java/var-config/src/main/java/com/oselvar/var/config/VarConfig.java`
- Create: `java/var-config/src/test/java/com/oselvar/var/config/JsonTest.java`
- Create: `java/var-config/src/test/java/com/oselvar/var/config/VarConfigTest.java`
- Create: `java/var-config/src/test/java/com/oselvar/var/config/ConfigConformanceTest.java`
- Modify: `java/pom.xml` (add `<module>var-config</module>` after `var-core`)

**Interfaces:**
- Consumes: `conformance/config/cases/` contract from Task 1; `com.oselvar.var.core.CanonicalJson.canonicalStringify(Object)` (test scope).
- Produces (relied on by Task 8): `com.oselvar.var.config.VarConfig` record — `VarConfig(List<String> docsInclude, List<String> docsExclude, List<String> steps, Map<String, String> snippets, List<String> scannerPlugins)` with static `VarConfig load(Path root)` (reads `<root>/var.config.json`; missing → `VarConfig.empty()`; invalid → `IllegalArgumentException` whose message starts with the file path), static `VarConfig parse(String jsonText, String sourceName)`, and static `VarConfig empty()`. Also `com.oselvar.var.config.Json.parse(String): Object` (Map/List/String/Long/Double/Boolean/null) throwing `IllegalArgumentException` with offset on malformed input.

- [ ] **Step 1: Create the module**

`java/var-config/pom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>com.oselvar</groupId>
    <artifactId>var-parent</artifactId>
    <version>0.0.0</version>
  </parent>

  <artifactId>var-config</artifactId>
  <packaging>jar</packaging>
  <name>var-config (Java) — var.config.json reader</name>
  <description>
    Reads var.config.json, the shared config file for all var tools (see
    conformance/config/README.md and
    doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md).
    Zero runtime dependencies: JSON parsing is hand-rolled, mirroring
    var-core's hand-rolled CanonicalJson writer.
  </description>

  <dependencies>
    <dependency>
      <groupId>com.oselvar</groupId>
      <artifactId>var-core</artifactId>
      <version>${project.version}</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
```

In `java/pom.xml`, add `<module>var-config</module>` to `<modules>` right after `<module>var-core</module>`.

- [ ] **Step 2: Write the failing JSON-parser test**

`java/var-config/src/test/java/com/oselvar/var/config/JsonTest.java`:

```java
package com.oselvar.var.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JsonTest {

    @Test
    void parsesObjectsArraysStringsNumbersBooleansNull() {
        Object v = Json.parse("{\"a\": [1, 2.5, \"s\", true, false, null], \"b\": {}}");
        Map<?, ?> obj = (Map<?, ?>) v;
        assertEquals(Map.of(), obj.get("b"));
        List<?> a = (List<?>) obj.get("a");
        assertEquals(1L, a.get(0));
        assertEquals(2.5, a.get(1));
        assertEquals("s", a.get(2));
        assertEquals(true, a.get(3));
        assertEquals(false, a.get(4));
        assertEquals(null, a.get(5));
    }

    @Test
    void decodesStringEscapes() {
        assertEquals("a\"b\\c/\b\f\n\r\té", Json.parse(
                "\"a\\\"b\\\\c\\/\\b\\f\\n\\r\\t\\u00e9\""));
    }

    @Test
    void rejectsTrailingGarbageAndTruncatedInput() {
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{} x"));
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{ \"a\": "));
        assertThrows(IllegalArgumentException.class, () -> Json.parse(""));
        IllegalArgumentException e =
                assertThrows(IllegalArgumentException.class, () -> Json.parse("{ nope"));
        assertTrue(e.getMessage().contains("offset"), e.getMessage());
    }

    @Test
    void rejectsDuplicateObjectKeys() {
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{\"a\":1,\"a\":2}"));
    }
}
```

Run (from `java/`): `mvn --batch-mode -pl var-config -am test`
Expected: FAIL — `Json` does not exist.

- [ ] **Step 3: Implement the JSON parser**

`java/var-config/src/main/java/com/oselvar/var/config/Json.java`:

```java
package com.oselvar.var.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal recursive-descent JSON parser: the reading twin of var-core's
 * hand-rolled {@code CanonicalJson} writer. The repo deliberately has zero
 * JSON library dependencies; var.config.json files are tiny, so a ~150-line
 * strict parser (objects, arrays, strings with escapes, numbers, booleans,
 * null — no extensions, no comments, duplicate keys rejected) beats pulling
 * in Jackson for one file format.
 *
 * <p>Numbers parse as {@link Long} when integral (no '.', 'e', 'E'),
 * otherwise {@link Double}. Objects are {@link LinkedHashMap} (insertion
 * order), arrays are {@link ArrayList}.
 */
public final class Json {

    private Json() {}

    public static Object parse(String text) {
        Parser p = new Parser(text);
        p.skipWhitespace();
        Object value = p.parseValue();
        p.skipWhitespace();
        if (!p.atEnd()) throw p.error("unexpected trailing content");
        return value;
    }

    private static final class Parser {
        private final String s;
        private int i = 0;

        Parser(String s) {
            this.s = s;
        }

        boolean atEnd() {
            return i >= s.length();
        }

        IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at offset " + i);
        }

        void skipWhitespace() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        char peek() {
            if (atEnd()) throw error("unexpected end of input");
            return s.charAt(i);
        }

        void expect(char c) {
            if (atEnd() || s.charAt(i) != c) throw error("expected '" + c + "'");
            i++;
        }

        Object parseValue() {
            char c = peek();
            return switch (c) {
                case '{' -> parseObject();
                case '[' -> parseArray();
                case '"' -> parseString();
                case 't' -> parseLiteral("true", Boolean.TRUE);
                case 'f' -> parseLiteral("false", Boolean.FALSE);
                case 'n' -> parseLiteral("null", null);
                default -> parseNumber();
            };
        }

        Object parseLiteral(String literal, Object value) {
            if (!s.startsWith(literal, i)) throw error("invalid literal");
            i += literal.length();
            return value;
        }

        Map<String, Object> parseObject() {
            expect('{');
            Map<String, Object> out = new LinkedHashMap<>();
            skipWhitespace();
            if (!atEnd() && peek() == '}') {
                i++;
                return out;
            }
            while (true) {
                skipWhitespace();
                String key = parseString();
                if (out.containsKey(key)) throw error("duplicate key \"" + key + "\"");
                skipWhitespace();
                expect(':');
                skipWhitespace();
                out.put(key, parseValue());
                skipWhitespace();
                char c = peek();
                if (c == ',') {
                    i++;
                    continue;
                }
                if (c == '}') {
                    i++;
                    return out;
                }
                throw error("expected ',' or '}'");
            }
        }

        List<Object> parseArray() {
            expect('[');
            List<Object> out = new ArrayList<>();
            skipWhitespace();
            if (!atEnd() && peek() == ']') {
                i++;
                return out;
            }
            while (true) {
                skipWhitespace();
                out.add(parseValue());
                skipWhitespace();
                char c = peek();
                if (c == ',') {
                    i++;
                    continue;
                }
                if (c == ']') {
                    i++;
                    return out;
                }
                throw error("expected ',' or ']'");
            }
        }

        String parseString() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                if (atEnd()) throw error("unterminated string");
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c == '\\') {
                    if (atEnd()) throw error("unterminated escape");
                    char e = s.charAt(i++);
                    switch (e) {
                        case '"' -> sb.append('"');
                        case '\\' -> sb.append('\\');
                        case '/' -> sb.append('/');
                        case 'b' -> sb.append('\b');
                        case 'f' -> sb.append('\f');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'u' -> {
                            if (i + 4 > s.length()) throw error("truncated \\u escape");
                            sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                            i += 4;
                        }
                        default -> throw error("invalid escape '\\" + e + "'");
                    }
                } else if (c < 0x20) {
                    throw error("unescaped control character in string");
                } else {
                    sb.append(c);
                }
            }
        }

        Object parseNumber() {
            int start = i;
            if (!atEnd() && s.charAt(i) == '-') i++;
            while (!atEnd() && Character.isDigit(s.charAt(i))) i++;
            boolean integral = true;
            if (!atEnd() && s.charAt(i) == '.') {
                integral = false;
                i++;
                while (!atEnd() && Character.isDigit(s.charAt(i))) i++;
            }
            if (!atEnd() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                integral = false;
                i++;
                if (!atEnd() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                while (!atEnd() && Character.isDigit(s.charAt(i))) i++;
            }
            String token = s.substring(start, i);
            if (token.isEmpty() || token.equals("-")) throw error("invalid value");
            try {
                return integral ? (Object) Long.parseLong(token) : (Object) Double.parseDouble(token);
            } catch (NumberFormatException e) {
                throw error("invalid number \"" + token + "\"");
            }
        }
    }
}
```

Run: `mvn --batch-mode -pl var-config -am test` — JsonTest passes.

- [ ] **Step 4: Write the failing VarConfig tests**

`java/var-config/src/test/java/com/oselvar/var/config/VarConfigTest.java`:

```java
package com.oselvar.var.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VarConfigTest {

    @Test
    void parsesAllKeys() {
        VarConfig config = VarConfig.parse(
                """
                {
                  "docs": { "include": ["specs/**/*.md"], "exclude": ["specs/wip/**"] },
                  "steps": ["**/*Steps.java"],
                  "snippets": { "java": "J" },
                  "scannerPlugins": ["gherkinTables"]
                }
                """,
                "var.config.json");
        assertEquals(List.of("specs/**/*.md"), config.docsInclude());
        assertEquals(List.of("specs/wip/**"), config.docsExclude());
        assertEquals(List.of("**/*Steps.java"), config.steps());
        assertEquals(Map.of("java", "J"), config.snippets());
        assertEquals(List.of("gherkinTables"), config.scannerPlugins());
    }

    @Test
    void allKeysOptionalAndSchemaKeyIgnored() {
        assertEquals(VarConfig.empty(), VarConfig.parse("{ \"$schema\": \"x\" }", "var.config.json"));
    }

    @Test
    void unknownKeyIsRejected() {
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class,
                () -> VarConfig.parse("{ \"vars\": {} }", "var.config.json"));
        assertTrue(e.getMessage().contains("unknown key"), e.getMessage());
        assertTrue(e.getMessage().startsWith("var.config.json"), e.getMessage());
    }

    @Test
    void wrongTypeIsRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () -> VarConfig.parse("{ \"steps\": \"x\" }", "var.config.json"));
        assertThrows(
                IllegalArgumentException.class,
                () -> VarConfig.parse("{ \"snippets\": { \"java\": 1 } }", "var.config.json"));
    }

    @Test
    void loadReadsFileAndMissingFileIsEmpty(@TempDir Path dir) throws IOException {
        assertEquals(VarConfig.empty(), VarConfig.load(dir));
        Files.writeString(
                dir.resolve("var.config.json"),
                "{ \"docs\": { \"include\": [\"**/*.md\"] } }",
                StandardCharsets.UTF_8);
        assertEquals(List.of("**/*.md"), VarConfig.load(dir).docsInclude());
    }

    @Test
    void recordIsImmutable() {
        VarConfig config = VarConfig.empty();
        assertThrows(UnsupportedOperationException.class, () -> config.steps().add("x"));
    }
}
```

`java/var-config/src/test/java/com/oselvar/var/config/ConfigConformanceTest.java`:

```java
package com.oselvar.var.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.oselvar.var.core.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Shared config-conformance harness — see conformance/config/README.md. */
class ConfigConformanceTest {

    // Maven runs with java/var-config/ as the working directory; the corpus
    // is a repo-root sibling of java/, two levels up.
    private static final Path CASES_DIR = Paths.get("..", "..", "conformance", "config", "cases");

    static Stream<Named<Path>> cases() throws IOException {
        assertTrue(Files.isDirectory(CASES_DIR), () -> "Expected " + CASES_DIR.toAbsolutePath());
        try (Stream<Path> entries = Files.list(CASES_DIR)) {
            return entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .map(dir -> Named.of(dir.getFileName().toString(), dir))
                    .toList()
                    .stream();
        }
    }

    @ParameterizedTest
    @MethodSource("cases")
    void caseMatchesContract(Path caseDir) throws IOException {
        if (Files.exists(caseDir.resolve("expect-error.txt"))) {
            assertThrows(IllegalArgumentException.class, () -> VarConfig.load(caseDir));
            return;
        }
        VarConfig config = VarConfig.load(caseDir);
        Map<String, Object> docs = new LinkedHashMap<>();
        docs.put("include", config.docsInclude());
        docs.put("exclude", config.docsExclude());
        Map<String, Object> artifact = new LinkedHashMap<>();
        artifact.put("docs", docs);
        artifact.put("steps", config.steps());
        artifact.put("snippets", config.snippets());
        artifact.put("scannerPlugins", config.scannerPlugins());
        String actual = CanonicalJson.canonicalStringify(artifact);
        String expected =
                Files.readString(caseDir.resolve("golden.json"), StandardCharsets.UTF_8);
        assertEquals(expected, actual, () -> caseDir.getFileName() + " mismatch");
    }
}
```

Run: `mvn --batch-mode -pl var-config -am test`
Expected: FAIL — `VarConfig` does not exist.

- [ ] **Step 5: Implement VarConfig**

`java/var-config/src/main/java/com/oselvar/var/config/VarConfig.java`:

```java
package com.oselvar.var.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * The parsed var.config.json — the single shared config file for all var
 * tools across every language port. Same field semantics everywhere:
 * {@code docs.include} has no default (empty discovers nothing),
 * {@code docs.exclude} removes matches, both are plain globs (no {@code !}
 * prefix); {@code steps} globs step-definition files; {@code snippets} maps
 * language id to snippet template; {@code scannerPlugins} carries plugin
 * NAMES (resolution is a per-language concern — the Java port defines none
 * yet). Contract: conformance/config/README.md. All keys optional; unknown
 * keys, wrong types, and malformed JSON fail loudly (a typo'd config must
 * never silently discover nothing); a {@code $schema} key is ignored.
 */
public record VarConfig(
        List<String> docsInclude,
        List<String> docsExclude,
        List<String> steps,
        Map<String, String> snippets,
        List<String> scannerPlugins) {

    private static final Set<String> KNOWN_KEYS =
            Set.of("$schema", "docs", "steps", "snippets", "scannerPlugins");
    private static final Set<String> KNOWN_DOCS_KEYS = Set.of("include", "exclude");

    public VarConfig {
        docsInclude = List.copyOf(docsInclude);
        docsExclude = List.copyOf(docsExclude);
        steps = List.copyOf(steps);
        snippets = Map.copyOf(snippets);
        scannerPlugins = List.copyOf(scannerPlugins);
    }

    public static VarConfig empty() {
        return new VarConfig(List.of(), List.of(), List.of(), Map.of(), List.of());
    }

    /** Reads {@code <root>/var.config.json}; a missing file is the empty config. */
    public static VarConfig load(Path root) {
        Path path = root.resolve("var.config.json");
        if (!Files.isRegularFile(path)) return empty();
        String text;
        try {
            text = Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalArgumentException(path + ": " + e.getMessage(), e);
        }
        return parse(text, path.toString());
    }

    /** Pure parse of the config TEXT; {@code sourceName} prefixes every error message. */
    public static VarConfig parse(String jsonText, String sourceName) {
        Object data;
        try {
            data = Json.parse(jsonText);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(sourceName + ": invalid JSON: " + e.getMessage(), e);
        }
        if (!(data instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException(sourceName + ": top level must be an object");
        }
        Set<String> unknown = new TreeSet<>();
        for (Object key : map.keySet()) {
            if (!KNOWN_KEYS.contains((String) key)) unknown.add((String) key);
        }
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException(
                    sourceName + ": unknown key(s): " + String.join(", ", unknown));
        }
        List<String> docsInclude = List.of();
        List<String> docsExclude = List.of();
        Object docs = map.get("docs");
        if (docs != null) {
            if (!(docs instanceof Map<?, ?> docsMap)) {
                throw new IllegalArgumentException(sourceName + ": 'docs' must be an object");
            }
            Set<String> unknownDocs = new TreeSet<>();
            for (Object key : docsMap.keySet()) {
                if (!KNOWN_DOCS_KEYS.contains((String) key)) unknownDocs.add((String) key);
            }
            if (!unknownDocs.isEmpty()) {
                throw new IllegalArgumentException(
                        sourceName + ": unknown docs key(s): " + String.join(", ", unknownDocs));
            }
            docsInclude = stringList(docsMap.get("include"), "docs.include", sourceName);
            docsExclude = stringList(docsMap.get("exclude"), "docs.exclude", sourceName);
        }
        Map<String, String> snippets = new LinkedHashMap<>();
        Object rawSnippets = map.get("snippets");
        if (rawSnippets != null) {
            if (!(rawSnippets instanceof Map<?, ?> snippetsMap)) {
                throw new IllegalArgumentException(
                        sourceName + ": 'snippets' must be an object of strings");
            }
            for (Map.Entry<?, ?> entry : snippetsMap.entrySet()) {
                if (!(entry.getValue() instanceof String value)) {
                    throw new IllegalArgumentException(
                            sourceName + ": 'snippets' must be an object of strings");
                }
                snippets.put((String) entry.getKey(), value);
            }
        }
        return new VarConfig(
                docsInclude,
                docsExclude,
                stringList(map.get("steps"), "steps", sourceName),
                snippets,
                stringList(map.get("scannerPlugins"), "scannerPlugins", sourceName));
    }

    private static List<String> stringList(Object value, String key, String sourceName) {
        if (value == null) return List.of();
        if (!(value instanceof List<?> list)) {
            throw new IllegalArgumentException(
                    sourceName + ": '" + key + "' must be an array of strings");
        }
        List<String> out = new ArrayList<>(list.size());
        for (Object item : list) {
            if (!(item instanceof String s)) {
                throw new IllegalArgumentException(
                        sourceName + ": '" + key + "' must be an array of strings");
            }
            out.add(s);
        }
        return List.copyOf(out);
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `mvn --batch-mode -pl var-config -am test`
Expected: JsonTest, VarConfigTest, ConfigConformanceTest all pass (7 conformance cases: 4 golden matches incl. `no-config-file`, 3 expected errors).

If `CanonicalJson` turns out not to be visible from the test (it is `public final class` with `public static canonicalStringify` in package `com.oselvar.var.core`, so it should be) — fix visibility in var-core rather than duplicating the writer.

- [ ] **Step 7: Commit**

```bash
git add java/var-config java/pom.xml
git commit -m "feat(java): var-config module — hand-rolled JSON parser + var.config.json reader"
```

---

### Task 8: Java — rewire var-junit/var-runner onto `var-config`, delete the properties path

**Files:**
- Delete: `java/var-runner/src/main/java/com/oselvar/var/runner/VarConfig.java`, `java/var-runner/src/test/java/com/oselvar/var/runner/VarConfigTest.java`
- Modify: `java/var-junit/src/main/java/com/oselvar/var/junit/ConfigBridge.java`
- Modify: `java/var-junit/src/main/java/com/oselvar/var/junit/VarTestEngine.java` (import + accessors)
- Modify: `java/var-junit/src/main/java/com/oselvar/var/junit/DiscoverySelectorResolver.java`, `java/var-junit/src/main/java/com/oselvar/var/junit/VarFileSelectorResolver.java` (import; `varsInclude()`→`docsInclude()`, `varsExclude()`→`docsExclude()` at lines 86, 121, 259)
- Modify: `java/var-junit/pom.xml` (add var-config dependency), `java/var-runner/pom.xml` (no new dep — VarConfig leaves this module)
- Modify: `java/var-junit/src/test/java/com/oselvar/var/junit/ConformanceDogfoodTest.java` (lines ~195, 200) and any other test passing `var.vars.*`/`var.steps` configuration parameters
- Modify: `java/var-junit/src/test/resources/junit-platform.properties` (comment only — references `var.vars.include` key names)

**Interfaces:**
- Consumes: `com.oselvar.var.config.VarConfig` from Task 7.
- Produces: the engine's config lookup contract changes — the three `var.vars.include`/`var.vars.exclude`/`var.steps` configuration-parameter keys are DELETED and replaced by one optional key, `var.config.root`: the directory containing `var.config.json` (default: the JVM working directory). `ConfigBridge.fromConfigurationParameters(ConfigurationParameters): VarConfig` keeps its name.

- [ ] **Step 1: Rewrite ConfigBridge**

`java/var-junit/src/main/java/com/oselvar/var/junit/ConfigBridge.java`:

```java
package com.oselvar.var.junit;

import com.oselvar.var.config.VarConfig;
import java.nio.file.Path;
import org.junit.platform.engine.ConfigurationParameters;

/**
 * Resolves the engine's {@link VarConfig} from var.config.json. The single
 * configuration parameter {@code var.config.root} names the directory
 * holding var.config.json (tests point it at a temp workspace); it defaults
 * to the JVM working directory — the project root under Maven/Gradle. The
 * old {@code var.vars.include}/{@code var.vars.exclude}/{@code var.steps}
 * parameter keys are gone with the properties-based config format.
 */
public final class ConfigBridge {

    static final String CONFIG_ROOT_KEY = "var.config.root";

    private ConfigBridge() {}

    public static VarConfig fromConfigurationParameters(ConfigurationParameters params) {
        Path root = params.get(CONFIG_ROOT_KEY).map(Path::of).orElse(Path.of(""));
        return VarConfig.load(root);
    }
}
```

Add to `java/var-junit/pom.xml` dependencies:

```xml
<dependency>
  <groupId>com.oselvar</groupId>
  <artifactId>var-config</artifactId>
  <version>${project.version}</version>
</dependency>
```

- [ ] **Step 2: Rename accessors at the call sites**

- `VarTestEngine.java`: change the import `com.oselvar.var.runner.VarConfig` → `com.oselvar.var.config.VarConfig`; `config.steps()` is unchanged.
- `DiscoverySelectorResolver.java` and `VarFileSelectorResolver.java`: same import change; `config.varsInclude()` → `config.docsInclude()` and `config.varsExclude()` → `config.docsExclude()` (VarFileSelectorResolver lines 86, 121, 259; update the javadoc at lines 38-39).
- Delete `java/var-runner/src/main/java/com/oselvar/var/runner/VarConfig.java` and `java/var-runner/src/test/java/com/oselvar/var/runner/VarConfigTest.java`.

```bash
git rm java/var-runner/src/main/java/com/oselvar/var/runner/VarConfig.java java/var-runner/src/test/java/com/oselvar/var/runner/VarConfigTest.java
```

- [ ] **Step 3: Migrate the tests that pass config parameters**

`java/var-junit/src/test/java/com/oselvar/var/junit/ConformanceDogfoodTest.java` (lines ~195, 200) currently passes `var.vars.include`-style configuration parameters to EngineTestKit. For each such site: create the spec/steps layout in a `@TempDir` (most of these tests already stage files in one), write a `var.config.json` into it with the same globs —

```java
Files.writeString(
        workspace.resolve("var.config.json"),
        """
        { "docs": { "include": ["%s"], "exclude": [] }, "steps": [] }
        """.formatted(includeGlob),
        StandardCharsets.UTF_8);
```

— and replace the old parameter(s) with `.configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())`. Grep `java/` for `var.vars.` and `"var.steps"` to catch every site; also update the stale key-name commentary in `java/var-junit/src/test/resources/junit-platform.properties` (the fixture key `var.junit.configPrecedenceTest` itself stays — it never was a var config key).

- [ ] **Step 4: Run the Java gate**

Run (from `java/`): `mvn --batch-mode verify`
Expected: exit 0, all modules (including var-kotlin/var-kotest, which don't touch VarConfig).

- [ ] **Step 5: Commit**

```bash
git add -A java
git commit -m "feat(java): engine reads var.config.json via var.config.root; properties keys removed"
```

---

### Task 9: Full gate + spec bookkeeping

**Files:**
- Modify: `doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md` (mark Sub-project A implemented)

**Interfaces:** none — verification only.

- [ ] **Step 1: Run the root gate**

Run (from the repo root): `make check`
Expected: exit 0 — all three ports build and test green, including the conformance corpus.

- [ ] **Step 2: Grep for stragglers**

Run:

```bash
grep -rn "var\.config\.ts" --include="*.ts" --include="*.json" --include="*.md" . | grep -v node_modules | grep -v doc/superpowers
grep -rn "tool\.var" python --include="*.py" --include="*.toml" --include="*.md"
grep -rn "var\.vars\." java --include="*.java" --include="*.properties"
```

Expected: no hits outside `doc/superpowers/` history (specs/plans are records; leave them).

- [ ] **Step 3: Mark the spec section implemented and commit**

In `doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md`, change the Status line to `**Status:** Sub-project A implemented (this plan); B–D unimplemented` .

```bash
git add doc/superpowers/specs/2026-07-02-multi-language-authoring-design.md
git commit -m "docs: mark unified var.config.json (sub-project A) implemented"
```
