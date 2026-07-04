# @oselvar/bdd — Design

A markdown-native BDD tool that does not bring Gherkin's baggage. Sub-second feedback for agents and humans alike.

## 1. Scope

### In v1

- Markdown-as-tests authoring (headings delimit examples; sentence-level cucumber-expression substring matching; tables and code fences attach as DataTable/DocString).
- Single `step()` registration API; explicit per-example context via `defineContext`; custom parameter types via `defineParameterType` (delegates to `@cucumber/cucumber-expressions`).
- Three adapters: **vitest** (vite plugin + virtual-module transform), **node** (built-in `node:test`), **bun** (built-in `bun:test`). One shared `bdd.config.ts`.
- CLI: `bdd stepdef`, `bdd lint`, `bdd run`, `bdd init`.
- Keyword-as-hint missing-step diagnostics with paste-ready snippets, sourced from the Gherkin keyword-translations JSON (i18n out of the box).
- Ambiguous-match diagnostics listing every candidate plus source location.
- Programmatic parser/matcher API with byte-precise source positions on both sides (markdown text ↔ cucumber expression literal). Foundation for the later LSP/VSCode work.
- Dogfooding: the documentation IS the test suite. Diataxis-style structure.

### Deferred

- Tags + tag-expression filtering.
- Deno adapter, LSP server, VSCode extension.
- HTML/markdown rendered reports (terminal only for v1).
- Cucumber-messages compatibility layer.

### Givens

pnpm · biome · vitest (for the core's own tests) · knip · jscpd · TypeScript (ESM only) · Node ≥ 22 LTS.

## 2. Packages & file layout

```
oselvar-bdd/
├── pnpm-workspace.yaml
├── biome.json
├── knip.json
├── tsconfig.base.json
├── bdd.config.ts
├── packages/
│   ├── bdd/                     @oselvar/bdd        (core, runtime-agnostic, pure)
│   │   └── src/
│   │       ├── index.ts                ← public API: step, defineContext, defineParameterType
│   │       ├── ports.ts                ← BddSource, StepLoader, TestSink, Reporter, Clock
│   │       ├── parser/                 ← hand-rolled scanner + structurer
│   │       ├── matcher/                ← cucumber-expressions glue + matching algorithm
│   │       ├── registry.ts             ← immutable Registry + pure builder
│   │       ├── plan.ts                 ← (Bdd[], Registry) → ExecutionPlan
│   │       ├── execute.ts              ← (ExecutionPlan, { sink, reporter }) → void
│   │       ├── diagnostics.ts          ← ambiguous, missing, orphan tables, unreachable
│   │       ├── snippet.ts              ← step-def snippet generator
│   │       └── keywords.ts             ← Gherkin keyword JSON, build-time embedded
│   │
│   ├── bdd-vitest/              @oselvar/bdd-vitest
│   │   └── src/{plugin.ts, runtime.ts}
│   │
│   ├── bdd-node/                @oselvar/bdd-node
│   │   └── src/{runtime.ts, cli.ts}
│   │
│   ├── bdd-bun/                 @oselvar/bdd-bun
│   │   └── src/runtime.ts
│   │
│   └── bdd-cli/                 @oselvar/bdd-cli
│       └── src/{bin.ts, stepdef.ts, lint.ts}
│
├── examples/banking/            ← runnable sample
└── docs/                        ← diataxis: tutorial/, how-to/, reference/, explanation/
```

Adapters declare runners as `peerDependencies`, never `dependencies`. Core's only runtime dep is `@cucumber/cucumber-expressions`. ESM only. `tsc` per package; the CLI is bundled with `tsup` for fast cold start.

## 3. Authoring model (`.bdd.md` semantics)

**File.** A flat collection of examples. No Feature concept. Frontmatter ignored by the matcher (reserved).

**Example.** Any markdown heading (any level) whose body contains at least one step-matching sentence is an example. The body is the content from after the heading until the next heading at any level. The name is the heading's plain-text content, with keyword tokens stripped. Headings with no step matches are documentation, not examples.

**Step.** The matcher walks block-level elements (paragraph, list item, blockquote) and extracts plain-text sentences. For each sentence it finds **all non-overlapping substring matches** against the registered cucumber expressions, longest-leftmost preferred. Steps execute in document order: block order, then sentence order, then match start offset.

**Keywords.** Given/When/Then/And/But (in any Gherkin locale, sourced from cucumber/gherkin's keyword JSON) are invisible to matching. Their sole purpose is to enable the "missing step definition" diagnostic.

**DataTable.** A markdown table immediately following (separated only by blank lines) a step-bearing block attaches as the DataTable argument of the last step in that preceding block.

**DocString.** Same rule for fenced code blocks. The fence's info string (`json`, `yaml`, etc.) becomes the DocString's `contentType`.

**Ambiguous match.** Two or more step expressions matching the same `(start, length)` substring → error listing both, including source positions. The example fails; no steps execute.

**Missing step.** A keyword-led sentence with zero matches → error with a paste-ready snippet (and the equivalent `bdd stepdef "..."` command). Sentences without a keyword are silently treated as prose.

**Encoding.** UTF-8. Sentence splitting is Unicode-aware and conservative around `$1.50`, `e.g.`, `i.e.`, backtick code spans (treated as a single token).

**Convention.** Files are recommended to be named `*.bdd.md`. The config's `bdds` glob can be any pattern; plain `**/*.md` is allowed.

**Source positions.** Every AST node carries `{startOffset, endOffset, startLine, startCol, endLine, endCol}` against the original source. This AST is the input to both the runtime and the future LSP.

## 4. Step definition API

```ts
// @oselvar/bdd
export function step<Args extends readonly unknown[]>(
  expression: string,
  fn: (ctx: BddContext, ...args: Args) => void | Promise<void>,
): void

export function defineContext<C>(
  factory: () => C | Promise<C>,
): void

export function defineParameterType<T>(opts: {
  name: string
  regexp: RegExp | RegExp[]
  transformer: (...captures: string[]) => T
}): void
```

- `expression` must be a string literal at the call site (a biome rule will enforce this; the LSP relies on it for rename).
- `fn` receives the per-example context first, then captured cucumber-expression arguments in order. Async transparent.
- `Args` is inferred from the expression via a string-literal TS type helper handling built-in `{int}`, `{float}`, `{string}`, `{word}`, `{}`; custom types contribute via module augmentation.
- `defineContext` is called at most once per process. Default if absent: `() => ({})`.
- `defineParameterType` is a thin wrapper around cucumber-expressions' `ParameterTypeRegistry`.

**Not exported (intentional):** `Given`/`When`/`Then`, lifecycle hooks, `setWorldConstructor`, `setDefaultTimeout`, tag filters. Use adapter-native lifecycle (`beforeEach` etc.) and the future tag mechanism.

## 5. Parsing & matching algorithm

```
source UTF-8 → Scanner (blocks) → Structurer (examples) → Matcher (steps + args) → ExecutionPlan
```

Each stage is a pure function over immutable data.

### Scanner

Single-pass, no backtracking. Emits a `ReadonlyArray<Block>`:

```ts
type Block =
  | { kind: 'heading';        level: 1|2|3|4|5|6; text: string; span: Span }
  | { kind: 'paragraph';      text: string; span: Span }
  | { kind: 'list_item';      text: string; span: Span }
  | { kind: 'blockquote';     text: string; span: Span }
  | { kind: 'table';          rows: ReadonlyArray<Row>; span: Span }
  | { kind: 'fence';          info: string; body: string; span: Span }
  | { kind: 'thematic_break'; span: Span }
```

`text` is the rendered plain text (inline markdown stripped), with a parallel `inlineMap` so substring offsets can be lifted back to the source.

Deliberately unsupported in v1: reference-style links, footnotes, setext headings, HTML blocks, definition lists, MDX. Indented code blocks are treated as paragraphs (use fences for code).

### Structurer

Walks blocks, emits an immutable `Bdd`:

```ts
type Bdd = {
  readonly path: string
  readonly source: string
  readonly examples: ReadonlyArray<Example>
  readonly orphanTables: ReadonlyArray<Span>
}

type Example = {
  readonly name: string
  readonly span: Span
  readonly headingSpan: Span
  readonly body: ReadonlyArray<Block>
}
```

For each heading, collect blocks until the next heading at any level. Tentative examples with empty bodies are pruned in stage 3.

### Matcher

For each example body, in document order:

```
for block in body:
  if block is paragraph/list-item/blockquote:
    for sentence in splitSentences(block.text, block.inlineMap):
      hits = every registered expression's regex over sentence
      sort hits by (start asc, length desc)
      sweep left→right taking first hit at each position, skipping overlaps
      at-same-(start,length) collisions → ambiguous diagnostic, example fails
      convert captures via cucumber-expressions' Argument.build
      emit PlannedStep
  elif block is table:
    attach as DataTable to last step in previous block, else orphanTables
  elif block is fence:
    same as table, as DocString with contentType = info
```

Sentence splitting: Unicode-aware. Terminators `.`, `?`, `!`, `\n\n`, end-of-block. Do not split inside backtick code spans, numeric literals, common abbreviations, or before a lowercase letter.

### ExecutionPlan

```ts
type ExecutionPlan = {
  readonly bdd: Bdd
  readonly examples: ReadonlyArray<PlannedExample>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

type PlannedExample = {
  readonly name: string
  readonly span: Span
  readonly steps: ReadonlyArray<PlannedStep>
}

type PlannedStep = {
  readonly text: string
  readonly matchSpan: Span
  readonly stepDef: StepDef
  readonly args: ReadonlyArray<unknown>
  readonly dataTable?: Table
  readonly docString?: { content: string; contentType: string }
}
```

### Performance budget

- Scanner + Structurer: < 1 ms/KB on M-series Macs.
- Full parse+match for ~200 step defs + ~50 examples: low single-digit ms.
- Plan cached in-memory keyed by file hash; vitest's HMR invalidates on change.

## 6. Adapter runtimes

Each adapter is a thin imperative shell around the pure core. All share a boot sequence:

1. Load `bdd.config.ts`.
2. Glob `steps` patterns; dynamically `import()` each step file. Side-effecting `step()` calls accumulate registrations in a local mutable builder.
3. Freeze the builder into an immutable `Registry`.
4. Glob `bdds` patterns; read and parse each file → `Bdd`. Match against `Registry` → `ExecutionPlan`.
5. `executePlan(plan, { sink, reporter })`. The adapter implements `TestSink` and `Reporter`.

### Vitest adapter

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import bdd from '@oselvar/bdd-vitest'
export default defineConfig({ plugins: [bdd()] })
```

The plugin:
- Reads `bdd.config.ts` at server start.
- Adds `bdds` glob to vitest's `test.include`.
- `resolveId`/`load` hook: returns a virtual TS module per matched `.bdd.md`:
  ```ts
  import { test } from 'vitest'
  import { runBddFile } from '@oselvar/bdd-vitest/runtime'
  import './steps-barrel.ts'
  await runBddFile('/abs/path/foo.bdd.md', test)
  ```
- Tracks step-file → `.bdd.md` dependencies in vite's module graph for HMR invalidation.

Error-level diagnostics become failing `test(name, () => { throw new BddDiagnosticError(d) })` so they surface in vitest's reporter with full source-position info.

### Node adapter

- Library: `import { runBdds } from '@oselvar/bdd-node'` for users embedding BDD in their own `node:test` setup.
- CLI: `bdd run` shells through `node:test` for the test runner, prints TAP (or spec via `--reporter spec`). One process, parse everything up front.
- Watch: `node --watch` plus a re-glob check on change. No custom scheduler.

### Bun adapter

Explicit test file (Bun lacks vite-equivalent plugin maturity):
```ts
import { runBddsSync } from '@oselvar/bdd-bun'
import './account.steps'
runBddsSync(import.meta.dir)
```
`TestSink` wraps `bun:test`'s `test()`.

### What's common vs. adapter-specific

|                              | Core (`@oselvar/bdd`) | Vitest | Node | Bun |
|------------------------------|:--:|:--:|:--:|:--:|
| Markdown parse + match        | ✓ | – | – | – |
| Registry/plan/diagnostics     | ✓ | – | – | – |
| Glob + import step files      | – | ✓ | ✓ | ✓ |
| Read `.bdd.md` from disk      | – | ✓ | ✓ | ✓ |
| Schedule tests in a runner    | – | ✓ | ✓ | ✓ |
| Watch / HMR                   | – | ✓ (vite) | ✓ (`node --watch`) | – |
| Reporter                      | – | vitest's | node:test's | bun:test's |

## 7. CLI

```
bdd stepdef "<text>" [--file <path>] [--print]
bdd lint    [<bdds-glob>...] [--json] [--strict]
bdd run     [<bdds-glob>...] [--watch] [--reporter <name>]
bdd init    [--adapter vitest|node|bun]
```

All commands resolve `bdd.config.ts` from cwd (or `--config <path>`). The CLI is the imperative shell — every command calls into the pure core (`generateSnippet`, `parse`, `plan`, etc.) and prints the result.

### `bdd stepdef "<text>"`

Generates a step definition from a concrete sentence.

1. Tokenize and infer cucumber-expression parameters: `5` → `{int}`, `3.14` → `{float}`, `"red"` → `{string}`, registered custom-type regex hits → `{customType}`.
2. Produce the expression and a typed handler signature.
3. Resolve target file: `--file` if given; else glob `steps` from config and 0-match (prompt or default) / 1-match (use) / >1-match (prompt). Non-TTY skips prompts.
4. Append (or create file with imports). With `--print`, write to stdout instead — this is the path the VSCode extension and CI use.

### `bdd lint`

Reports without running tests:
- Missing step (keyword-led sentence, no match) — includes the `bdd stepdef "..."` command.
- Ambiguous match — both candidates with source positions.
- Orphan table / fence — a table/fence not immediately following a step-bearing block.
- Unreachable example (heading with no matches) — warning, error with `--strict`.

`--json` emits a stable shape for CI and the future LSP. Sub-100 ms for hundreds of files.

### `bdd run`

Standalone runner via `@oselvar/bdd-node`. No vitest required. TAP by default; `--reporter spec`; `--watch` shells out to `node --watch`. Exit code 0 = all pass, 1 = any failure or any error-level diagnostic.

### `bdd init`

Creates `bdd.config.ts`, an `examples/hello.bdd.md`, an `examples/hello.steps.ts`, and either wires up `vitest.config.ts`, adds a `bdd run` script, or scaffolds a `*.test.ts` calling `runBddsSync`, depending on adapter choice.

### CLI implementation notes

- Tiny hand-rolled argv parsing — no `commander`/`yargs`.
- `node:readline` for prompts — no `inquirer`/`prompts`.
- TTY-aware: never prompts in CI/agent contexts; emits actionable error explaining the flag instead.
- 30-line ANSI helper — no `chalk`.

## 8. Architectural principles

These are non-negotiable. They show up in code review, in CLAUDE.md, and in the public types.

- **Immutable types.** All AST/plan/diagnostic types are `readonly` with `ReadonlyArray<T>` and `ReadonlyMap<K,V>`. Updates produce new values.
- **Pure functions everywhere they're possible.** Parsing, structuring, matching, planning, snippet generation, diagnostics: pure. Same input → same output, zero side effects.
- **Functional core, imperative shell.** Core (`@oselvar/bdd`) is pure functions over immutable data. The shell (adapter packages and CLI) is the *only* place file I/O, dynamic `import()`, prompts, terminal output, and `process.exit` are allowed.
- **Hexagonal architecture.** Core defines ports (`BddSource`, `StepLoader`, `TestSink`, `Reporter`, `Clock`); adapters implement them. Core never imports from `node:fs`, `vitest`, `bun:test`, or any runner-specific module.

| Layer       | Lives in                          | May do                                  | May NOT do                          |
|-------------|-----------------------------------|-----------------------------------------|-------------------------------------|
| Core domain | `packages/bdd/src/*`              | pure transformations over immutable AST | filesystem, network, globals, time  |
| Ports       | `packages/bdd/src/ports.ts`       | declare interfaces                      | implement them                      |
| Adapters    | `packages/bdd-*/src/*`            | implement ports; talk to runtime APIs   | leak runtime types into the core    |

If a function in core needs file bytes, it takes them as an argument. If it needs the current time, the caller passes a `Clock`. No exceptions.

## 9. Dogfooding & docs

The docs ARE the test suite.

```
docs/
├── tutorial/          ← learning-oriented; runnable .bdd.md
├── how-to/            ← task-oriented; runnable .bdd.md
├── reference/         ← information-oriented; prose, partly auto-generated
└── explanation/       ← understanding-oriented; prose
```

- `tutorial/` and `how-to/` are matched by `bdd.config.ts`'s `bdds` glob. They run as `pnpm test`.
- Step defs live next to their docs (`docs/tutorial/steps/*.steps.ts`).
- `reference/cli.md` is generated from `bdd --help`; `reference/step-api.md` from TS doc-comments. A CI lint check fails if they drift.
- `explanation/` is prose only, but links into specific runnable examples.

Build-out order: write the failing doc first (`docs/tutorial/01-hello-bdd.bdd.md`), implement just enough to make it green, move to the next doc. A feature without a `.bdd.md` proving it doesn't exist.

## 10. Roadmap

### v1.0 — first usable release

Everything in Sections 1–9. CI matrix: node 22 LTS, bun latest.

### v1.1 — runtime breadth

- `@oselvar/bdd-deno` adapter using `Deno.test`, published to JSR.
- CI matrix gains deno.
- `bdd init --adapter deno`.

### v1.2 — author ergonomics

- Tag expressions. `@tag` tokens in markdown (exact location revisited). Filtering via `--tags`, env var, and vitest plugin option.
- `bdd lint --strict` graduates warnings to errors.
- Diagnostics gain source snippets with carets (rustc/biome style).

### v1.3 — VSCode extension + LSP

- `@oselvar/bdd-lsp` server using the core's programmatic API.
- Highlighting, hover, go-to-definition, find-references, rename (cascades both ways: cucumber-expression rename updates all markdown matches; markdown text rename updates the step-def expression).
- Code action "Generate step definition" backed by core's `generateSnippet`.
- VSCode extension as a thin LSP client.

### v2 candidates

- HTML/markdown rendered reports.
- Parallel example execution within a single file.
- Opt-in cucumber-messages compatibility layer for migration.
- Adapters for mocha/jest/ava if asked.

### Hard non-goals

- Scenario Outlines, Backgrounds, Rules.
- A `cucumber-messages` runtime as the default.
- Network/cloud reporters.
