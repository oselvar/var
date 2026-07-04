# Run-result format + pure hash + vitest reporter

Date: 2026-06-28
Status: design, pending implementation (TDD).

Sub-project #1 of the shared run-result work. Builds on the return-comparison
core ([cell-diff](2026-06-28-cell-diff-design.md),
[table & doc-string](2026-06-28-table-docstring-return-comparison-design.md))
and the editor rendering
([phase 2b](2026-06-28-phase-2b-editor-cell-rendering-design.md)).

## Why

The core already fails a mismatch with structured, span-anchored data
(`CellMismatchError.cells: CellDiff[]`, `DocStringMismatchError.diff`). The
website's in-browser runner turns that into a small in-memory shape
(`packages/website/src/lib/run-types.ts`: `RunResults` / `ExampleResult` /
`CellFailure`) that CodeMirror renders as red cells + hover-actual.

That shape is, in miniature, a **var-specific run-result format**. This
sub-project promotes it into the core as the canonical, serializable type and
gives it a producer beyond the browser: a vitest reporter that writes
`.var/<spec>.json` after a run. A persisted, span-anchored result file is the
spine that later lets the LSP show the same red+hover in VSCode (sub-project #2)
and a `<script src="var.js">` overlay highlight rendered HTML (sub-project #3).

## Scope

In:

1. A shared run-result format in `@oselvar/var` (pure, serializable, immutable).
2. A pure, dependency-free source hash (`hashSource`) in `@oselvar/var`.
3. A pure error→failure helper (`toFailure`) in `@oselvar/var`, shared by every
   producer.
4. One optional, backward-compatible field on the core `TestSink.example` port
   so the sink learns each example's `lines`.
5. A custom vitest reporter in `@oselvar/var-vitest` that writes
   `.var/<mirrored-spec-path>.json`, plus the boundary wrapper that feeds it via
   `task.meta`.
6. The website refactored onto the shared type + helper as the first consumer.

Out (later sub-projects, but the format must not foreclose them):

- **LSP / VSCode red+hover** — consumes `.var/` + `sourceHash`. Sub-project #2.
- **`var.js` HTML overlay** — fetches `.var/`, overlays `ins`/`del`. #3.
- **Example-drift detection** ("this used to be an example") — a *separate*
  committed, workspace-global, fingerprint-keyed baseline; not a field in this
  ephemeral, path-keyed, git-ignored results file. Sub-project #4. Its seam is
  already present here: each `ExampleResult` carries `name` + `lines`, the raw
  material a future resilient fingerprint is computed from. **No speculative
  fields are added now.**

## File layout

One result file per spec, mirroring the spec's path under `.var/`:

```
docs/tutorial/04-yahtzee.var.md
  → .var/docs/tutorial/04-yahtzee.var.md.json
```

Rationale: most decoupled; the LSP maps an open file straight to one result
file; a partial test run only rewrites the specs it actually ran. `.var/` is
**git-ignored** (these results are ephemeral, regenerated each run).

Anything that must track examples *over time* (drift, #4) is instead
**workspace-global**, not per-file — so moving an example between specs is one
move, not a disappearance + appearance. That artifact is out of scope here; the
note is recorded so #4 does not key its baseline by path.

## Format (core, pure, serializable)

`packages/var/src/result.ts`:

```ts
export type CellFailure = {
  readonly from: number   // source offset of the EXPECTED cell text (== CodeMirror position)
  readonly to: number     // source offset, exclusive
  readonly actual: string // the runtime value the step produced
}

export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number> // 1-based source lines of this example's steps
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    readonly cells?: ReadonlyArray<CellFailure> // table / header-bound row mismatches
    readonly doc?: CellFailure                  // doc-string body mismatch (single span)
  }
}

export type SpecResults = {
  readonly version: 1
  readonly specPath: string   // the spec path as written (POSIX separators)
  readonly sourceHash: string // hashSource(spec source) at run time
  readonly examples: ReadonlyArray<ExampleResult>
}
```

`ExampleResult` / `CellFailure` are exactly today's website shapes, moved into
the core verbatim so the website imports rather than redeclares them.
`SpecResults` wraps them with `version`, `specPath`, and `sourceHash` — the
persisted file *is* a `SpecResults`.

`version` is the format version (literal `1`); consumers reject what they don't
understand. `specPath` is stored with POSIX separators so a result written on
one OS resolves on another.

## Hash (core, pure, dependency-free)

`packages/var/src/hash.ts`:

```ts
// FNV-1a, 32-bit. No node:crypto (core never imports node:*). Deterministic and
// identical across producers/consumers: the reporter, the LSP, and var.js all
// compute the same hash from the same bytes — so staleness is exact, not
// best-effort, and language-agnostic for a future non-JS runtime.
export function hashSource(source: string): string // e.g. "fnv1a:1a2b3c4d"
```

FNV-1a is chosen over a crypto hash deliberately: this is a *change-detector*,
not a security primitive. It needs to be tiny, dependency-free, and trivially
re-implementable in another language. The `fnv1a:` prefix namespaces the
algorithm so the format can adopt a different one later without ambiguity.

### Staleness contract

Every `.var/*.json` carries the `sourceHash` of the source it was computed from.
A consumer compares it to `hashSource(currentSource)`:

- **match** → offsets are valid against the current source; render.
- **mismatch** → the file changed since the run; results are obsolete; do not
  render.

This is the persisted form of the editor's existing in-memory rule (results are
cleared on `docChanged`). It is the only invalidation mechanism; there is no
partial remap.

## Shared pure helper: `toFailure` (core)

The website's `run-spec.ts` already hand-rolls the logic that turns a thrown
step error into an `ExampleResult['failure']`. Promote it into the core, pure,
so the vitest wrapper and the browser runner build byte-identical failures.

`packages/var/src/failure.ts`:

```ts
// A thrown step error → the ExampleResult.failure payload. `specPath` and
// `fallbackLine` recover the failing line: executePlan injects a
// `<specPath>:line:col` frame into the stack (see augmentStack); failingLine
// parses it, falling back to the example's first step line.
export function toFailure(
  error: unknown,
  specPath: string,
  fallbackLine: number,
): NonNullable<ExampleResult['failure']>
```

Behavior (mirrors today's `run-spec.ts`):

- `line` = `failingLine(stack, specPath) ?? fallbackLine` — where `failingLine`
  (module-internal to `failure.ts`, not part of the package's public API)
  regex-matches the injected `<specPath>:(\d+):\d+` frame, with `specPath`
  regex-escaped.
- `message` = `String((error as Error)?.message ?? error)`.
- `stack` = `String((error as Error)?.stack ?? error)`.
- `cells` (omitted when empty) — `isCellMismatchError(error)` → the `!ok` diffs
  mapped to `{ from: span.startOffset, to: span.endOffset, actual }`.
- `doc` — `isDocStringMismatchError(error)` →
  `{ from: span.startOffset, to: span.endOffset, actual: diff.actual }`.
- a plain `Error` / `ReturnShapeError` yields just `line`/`message`/`stack`.

`toFailure` is called only on the failure path (a thrown error always means a
failed example), so it always returns a payload.

## Core port change: `TestSink.example` learns the example's lines

`packages/var/src/ports.ts` — add one optional, backward-compatible param:

```ts
export interface TestSink {
  example(
    name: string,
    run: () => void | Promise<void>,
    info?: { readonly lines: ReadonlyArray<number> }, // 1-based source lines of the example's steps
  ): void
}
```

`packages/var/src/execute.ts` — the executor already holds each
`PlannedExample`; pass its step lines at the existing callsite
(`execute.ts:21`):

```ts
ports.sink.example(
  ex.name,
  async () => { /* unchanged */ },
  { lines: [...new Set(ex.steps.map((s) => s.matchSpan.startLine))] },
)
```

`info` is optional, so existing sinks (the website's, which computes `lines`
itself in-process; any test sink) keep compiling unchanged. The vitest sink is
the one consumer that needs it — because it runs where the plan is available
(the worker) but reports where it is not (the main process). See below.

## Producer: vitest reporter

Each Vár example already becomes one vitest `test()` (via the generated virtual
module's `sink.example`). Example tests run in **worker** processes; a vitest
reporter runs in the **main** process. The plan (and thus example names, lines,
matched steps, and the live step registry) exists **only in the worker** — the
main process never imports the `.steps.ts` files, so it cannot re-`plan()` (an
empty registry matches nothing and `plan` drops every example,
`plan.ts:170`). Therefore the **full** `ExampleResult` is assembled in the
worker, where everything is in hand, and carried to the reporter over vitest's
`task.meta` (serialized — the blessed channel for custom per-test data).

### Boundary wrapper — `packages/var-vitest/src/plugin.ts`

`generateVirtualModule` wraps each example run, attaching a complete
`ExampleResult` to the test's `task.meta` (then re-throwing on failure so vitest
still records the failure exactly as today). The generated module imports
`toFailure` from `@oselvar/var`:

```ts
// inside the generated module, per example:
sink: {
  example: (name, run, info) =>
    vitestTest(name, async (ctx) => {
      const lines = info?.lines ?? []
      try {
        await run()
        ctx.task.meta.varResult = { name, status: 'passed', lines }
      } catch (error) {
        ctx.task.meta.varResult = {
          name,
          status: 'failed',
          lines,
          failure: toFailure(error, PATH, lines[0] ?? 0),
        }
        throw error
      }
    }),
}
```

`PATH` is the spec path the module already embeds. `meta.varResult` is a full
`ExampleResult`.

### Reporter — `packages/var-vitest/src/reporter.ts`

Exported as `@oselvar/var-vitest/reporter`. Registry-free — it does **no**
parsing and **no** `plan()`. A pure `buildSpecResults` plus a thin Vitest
`Reporter` shell:

```ts
// pure — unit-testable with fabricated inputs
export function buildSpecResults(
  specPath: string,                       // POSIX-normalized
  source: string,
  examples: ReadonlyArray<ExampleResult>, // from task.meta, in declaration order
): SpecResults // { version: 1, specPath, sourceHash: hashSource(source), examples }
```

The Vitest `Reporter` (`onFinished(files)`):

1. Walks the file tree; for each test task reads `task.meta.varResult`
   (an `ExampleResult`). Skips tasks without it — the `var:diagnostic:*` tasks
   the generated module emits carry none.
2. Groups the collected `ExampleResult`s by their owning spec file
   (`task.file.filepath`, ending in `.var.md`), preserving declaration order.
3. For each spec file: reads the spec source from disk, POSIX-normalizes the
   path (relative to cwd), calls `buildSpecResults`, and writes
   `.var/<mirrored-spec-path>.json` (creating parent dirs, pretty JSON).

The only side-effecting code is the shell (reading source, writing files): it
lives in the adapter (`var-vitest`), in the main process, as a single writer per
spec — no worker write race. Users opt in by adding the reporter to their vitest
config.

> **Why not reconstruct in the reporter?** An earlier draft had the reporter
> re-`parse()` + `plan()` each spec to recover `name`/`lines`. That cannot work:
> `plan()` needs the populated step registry, which exists only in the worker;
> in the main process the registry is empty and every example is dropped.
> Computing the `ExampleResult` in the worker (where the plan is live) and
> shipping it via `meta` is both correct *and* simpler — the reporter never
> parses, and there is no second parse. The cost is one optional `TestSink`
> param, which the executor already has the data to fill.

## Consumer: website (refactor onto the shared type + helper)

- Delete `packages/website/src/lib/run-types.ts`; import `SpecResults`,
  `ExampleResult`, `CellFailure` from `@oselvar/var`.
- `run-spec.ts`: replace the inline `isCellMismatchError`/
  `isDocStringMismatchError` extraction **and** the private `failingLine` with a
  single `toFailure(err, varPath, lines[0] ?? 0)` call on the catch path. Return
  a full `SpecResults` (`version: 1`, `specPath: varPath`,
  `sourceHash: hashSource(varSource)`, `examples`). The website's sink keeps its
  two-arg `example(name, run)` shape (it computes `lines` in-process from the
  plan it holds); the new optional third param is simply not declared. Behavior
  is otherwise unchanged.
- `cm-run.ts`: behavior unchanged. The `setRunResults` effect and fields now
  carry `SpecResults` (read `.examples` off it) — a type rename, no logic
  change.
- Update any other `run-types` importer (`grep -rl run-types
  packages/website/src`) to the core import.

No new rendering; this sub-project is plumbing. The visible payoff is the
`.var/` files and a single shared type.

## `.gitignore`

Add `.var/` (ephemeral, regenerated each run).

## Architecture / hexagonal check

| Piece | Package | Pure? | Notes |
|-------|---------|-------|-------|
| `SpecResults` / `ExampleResult` / `CellFailure` | `@oselvar/var` | data | serializable, immutable |
| `hashSource` | `@oselvar/var` | ✅ | no `node:*` |
| `toFailure` (+ internal `failingLine`) | `@oselvar/var` | ✅ | shared by both producers |
| `TestSink.example` `info` param | `@oselvar/var` | data | optional, backward-compatible |
| `executePlan` passing `lines` | `@oselvar/var` | ✅ | derives from `PlannedExample` |
| boundary wrapper | `@oselvar/var-vitest` | n/a | builds `ExampleResult` into `meta`, re-throws |
| `buildSpecResults` | `@oselvar/var-vitest` | ✅ | pure assembler |
| reporter shell (file I/O) | `@oselvar/var-vitest` | ❌ (shell) | only side effects, main process |
| website runner | `@oselvar/website` | n/a | builds the shared type |

The core gains no `node:` imports and no I/O. All file reading/writing is in the
`var-vitest` adapter.

## Testing (TDD order, pure-first)

1. **`hashSource`** (core unit): deterministic for the same input; different for
   a one-char change; output carries the `fnv1a:` prefix; a stable known-vector
   (assert a specific hash for a fixed string so a future refactor can't
   silently change the algorithm).
2. **`toFailure`** (core unit): a `CellMismatchError` yields `cells` with the
   right `{from,to,actual}` (offsets slice back to the expected text) and
   `line`/`message`/`stack`; a whole-table mismatch yields multiple `cells`; a
   `DocStringMismatchError` yields `doc`; a `ReturnShapeError` and a plain
   `Error` yield no `cells`/`doc`; `line` comes from an injected
   `path/to.var.md:12:3` stack frame (→ `12`) and falls back to `fallbackLine`
   when absent; a `.` in `specPath` does not match arbitrary chars (regex
   escaped).
3. **`executePlan` passes `lines`** (core unit): a recording sink captures the
   third `info` arg; for a two-step example its `info.lines` are the deduped
   1-based step lines.
4. **`generateVirtualModule`** (var-vitest unit): the emitted module imports
   `toFailure`, and its `sink.example` wrapper assigns a passed `ExampleResult`
   to `ctx.task.meta.varResult` on success and a failed one (with
   `toFailure(...)`) before re-throwing.
5. **`buildSpecResults`** (var-vitest unit): given a `specPath`, a source, and
   an ordered `ExampleResult[]`, returns `{ version: 1, specPath, sourceHash:
   hashSource(source), examples }` (sourceHash matches the core helper; examples
   preserved in order).
6. **reporter** (var-vitest unit): given a fabricated `onFinished` file tree
   (test tasks with `meta.varResult`, plus a `var:diagnostic:*` task with none)
   and stub source-reader / writer, it groups by spec file, skips the
   diagnostic task, and writes the mirrored-path JSON produced by
   `buildSpecResults`.
7. **website** (existing suite): `run-spec` tests pass unchanged against
   `toFailure`; the deleted `run-types.ts` is fully replaced by the core import
   (build green).
8. **dogfood end-to-end**: running the tutorial via
   `NODE_OPTIONS="--import tsx" npx vitest run` with the reporter enabled
   produces `.var/docs/tutorial/04-yahtzee.var.md.json` (and `06-…`) whose
   examples match the known pass/fail state; a deliberate break flips the
   relevant example to `failed` with the expected `cells`/`doc`.

## Build gate

vitest does not type-check (esbuild/tsx strips types). Run `pnpm -r build`
(exit 0) after any task that touches a shared type or a package's public
exports — adding `result.ts`/`hash.ts`/`failure.ts` to the core's `index.ts`
exports, changing the `TestSink` port, and removing the website's
`run-types.ts` are exactly the changes that break `tsc` while vitest stays
green.

## Consumers / future direction (banked, not built here)

This format is the input to two later consumers; recorded here so #1's shape
stays compatible. **None of this is built in this sub-project.**

- **Unify *below* the LSP, not at the wire protocol.** The source of truth is a
  pure, **offset-based** layer in the core / `var-language`: static analysis
  (semantic tokens, diagnostics) plus this run-result format. `var-lsp` is *one*
  adapter that projects that layer into LSP types (offsets→`{line,char}`) for
  protocol clients. The website (CodeMirror) and a future `var.js` HTML overlay
  are *sibling* adapters that consume the pure layer **directly** — offset-native,
  no JSON-RPC, and run results never have to masquerade as LSP diagnostics.
- **VSCode (#2) is the exception that proves it.** VSCode already gets tokens /
  diagnostics via `var-lsp`, so the lightest path to run-results-in-VSCode is
  the server reading `.var/` (+ `sourceHash`) and publishing red+hover. VSCode
  *should* speak LSP; it's specifically the browser overlay where going through
  the protocol stops paying off (offset↔position round-trips on the data path
  that matters most).
- **Generic multi-language (e.g. rendering `.steps.ts`) is out of scope and
  likely overkill.** The website already renders TS diagnostics directly
  (`ts-diagnostics.ts`), and syntax highlighting for arbitrary languages is a
  lighter, solved problem (shiki/highlight.js). If a generic web code-viewer is
  ever wanted, an LSP-client overlay slots in as yet another sibling adapter
  without disturbing the decoration core.

## Out of scope / non-goals

- **No LSP, no VSCode, no var.js** here — they consume this format later.
- **No drift baseline** — separate committed artifact (#4); only its seam
  (`name` + `lines`) is reserved, with no new fields.
- **No new rendering** — `cm-run.ts` behavior is untouched.
- **No coercion / intra-value diffs** — unchanged from the return-comparison
  core; the format reddens whole spans.
