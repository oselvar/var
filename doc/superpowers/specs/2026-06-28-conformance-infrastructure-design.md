# Conformance infrastructure (cross-language)

Date: 2026-06-28
Status: design, pending implementation (TDD)

Sub-project 1 of the multi-language program (see
[`doc/adr/0001-second-language-python.md`](../../adr/0001-second-language-python.md)
and [`doc/ARCHITECTURE.md`](../../../doc/ARCHITECTURE.md)). It builds nothing
language-specific: it hardens the TypeScript implementation *and* defines the
verifiable contract every future port (Python first) is built against.

## Why

Vár will grow **parallel native implementations** — each language reimplements
the runtime side (markdown parse → match → plan → execute + the registration
API), kept consistent not by sharing code but by passing one shared,
language-agnostic conformance suite. (The authoring/LSP side is shared TS/wasm +
tree-sitter; that is Sub-project 2.)

This spec defines that suite: **real `.var.md` example bundles** plus an
instrumented **trace mode** that serializes each pipeline stage's output as
canonical JSON. The TypeScript implementation is the **reference** and generates
the committed **golden** artifacts; every other implementation must reproduce
them byte-for-byte, or the diff names the exact field that diverged.

Done before any second language exists, this is the "make the change easy"
prefactoring: it pins all current parse/plan/execute behaviour behind golden
files, so when Python arrives, conformance is the spec it targets.

## Resolved decisions

- **Committed canonical-JSON goldens** (not live reference-diffing, not inline
  expectations). Behaviour changes surface as reviewable git diffs; the corpus
  works across separate repos with no TS at runtime. The reference regenerates
  goldens via an `--update` affordance.
- **Conformance covers the *runner*, not static extraction.** `registry.json` is
  built from **executed** step-defs (runtime self-registration), never from
  static source parsing. Static step-def extraction / source-range conformance
  belongs to the tree-sitter/LSP seam (Sub-project 2).
- **Errors are represented structurally**, reusing the existing comparison
  machinery (`CellMismatchError`/`DocStringMismatchError` →
  [`cell-diff`](2026-06-28-cell-diff-design.md) /
  [`return-comparison`](2026-06-28-table-docstring-return-comparison-design.md)).
  Structured diffs are compared; opaque messages are not.
- **Structural context identity.** A step's context is identified in the trace by
  `{ exampleName, stepFile }`, never an opaque instance id — deterministic even
  when a runner executes examples in parallel.
- **Expected-error examples** ship as a minimal product feature here (an `error`
  fence), so failing corpus bundles are authorable as real, runnable examples.

## Scope

**In:** corpus structure + seed bundles with TS fixtures; the four projection
functions + canonical serializer in `@oselvar/var`; instrumented conformance
ports; the TS vitest harness (compare + `--update`); committed TS goldens; the
minimal expected-error feature. A thin `var conformance` CLI is optional.

**Out (later sub-projects):** static step-def extraction conformance / source
ranges (2); the canonical function-surface doc + porting skill (3); the Python
port (4); Python LSP tree-sitter queries (5); cross-repo corpus sharing
(submodule/published package — only matters once a port has its own repo);
structured matching of an *expected* error's diffs (a later enhancement; v1
matches a message substring only).

## Corpus layout

One directory per bundle. The `.var.md` and `golden/` are **shared** (identical
for every implementation); step-def fixtures are **native per language** (only
`steps.ts` exists now).

```
conformance/
  bundles/
    01-roman-numerals/
      example.var.md          # shared — identical bytes for every implementation
      steps.ts                # TS fixture: registers the same expressions + handlers
      golden/
        var-doc.json          # parsed markdown AST
        registry.json         # semantic registry content
        plan.json             # ExecutionPlan over example.var.md
        trace.json            # ordered execution events (+ failures, outcomes)
    02-context-isolation/     # two stepfiles → contexts must not bleed across examples
    03-expected-failure/      # an `error` fence → example expected to fail (abort semantics)
    04-tables-and-docstrings/ # attachment binding + return comparison (CellDiff/DocStringDiff)
    05-ambiguous-match/       # diagnostics
  README.md                   # corpus authoring rules
```

**Authoring rules:** corpus step-defs must be **deterministic** (no time,
randomness, or I/O). Seed bundles are curated from the **real**
`docs/tutorial/*.var.md` suites where possible; targeted bundles are added only
for semantics the real examples don't exercise (isolation, expected-failure,
ambiguity).

## The golden artifacts

Each is a *canonical projection* of an existing immutable type — never live
objects (no handlers, no compiled regexes). Field order, formatting and ordering
follow the canonicalization rules below.

### `var-doc.json`
The markdown AST: examples (`scopeStack`, `span` with offset + line/col),
blocks, `inlineMap`. Purest conformance — identical `.var.md` bytes must yield an
identical tree in every language.

### `registry.json`
*Semantic* registry only: ordered `{ expression, parameterTypeNames }` per step,
plus custom parameter types `{ name, regexp }`. Proves every port built the same
logical registry from its native step-defs. Source file/line is recorded in a
separate, **non-compared** `provenance` field (it differs per language).

### `plan.json`
The `ExecutionPlan` projected:
- per example: `{ name, scopeStack, span, expectedOutcome }`
- per step: `{ text, matchSpan, paramSpans, matchedExpression, args, dataTable?, docString? }`
- `diagnostics: [...]`

`args` are the **raw captured strings + parameter-type name**, never the
transformed values (those are language-specific objects).

### `trace.json`
Ordered execution events. Per step:

```
{ exampleName, ordinal, stepText, matchedExpression,
  contextKey: { exampleName, stepFile },
  outcome: "pass" | "fail" | "skipped",
  failure?: FailureArtifact }
```

Plus a per-example `outcome` (after applying `expectedOutcome`, see below).

## Error representation — `FailureArtifact`

A discriminated union capturing a failure in a language-agnostic way. Structured
kinds are fully compared; opaque kinds compare only `kind` + location.

```
FailureArtifact =
  | { kind: "cell-mismatch";       line; cells: [{ column, expected, actual, span }] }
  | { kind: "doc-string-mismatch"; line; diff: { expected, actual, span } }
  | { kind: "return-shape";        line }            // author mistake — message human-only
  | { kind: "thrown";              line }            // opaque handler throw
  | { kind: "unexpected-pass";     line }            // expectedOutcome=fail but it passed
```

- `line` and every `span` point **into the `.var.md`** → compared.
- `cells` / `diff` are taken verbatim from `CellDiff` / `DocStringDiff` (strings
  + integer spans) → **compared byte-for-byte**. A port's table mismatch must
  produce the same `(column, expected, actual)` diffs as TS.
- For `return-shape` / `thrown`, the human **message** is language-specific and
  is stored in a separate, **non-compared** annotation field (kept for
  debugging, ignored by the golden diff). Only `kind` + `line` are checked.

## Expected-error examples (minimal feature)

An example may declare it is **expected to fail**, so the suite treats an
unexpected pass as a failure.

**Surface.** An `error`-info-string fence attached to the example (mirrors how
doc-string fences attach):

````markdown
## A roman numeral over 3999 is rejected

When I convert 4000 to roman numerals

```error
out of range
```
````

- Presence of the `error` fence sets the example's `expectedOutcome = "fail"`
  (default is `"pass"`).
- An optional fence body is a **message substring** the actual failure's message
  must contain. (Structured-diff matching of the expected error is deferred.)

**Runner semantics** (`expectedOutcome` resolved in `executePlan`):

| declared | actually threw | reported example outcome |
|---|---|---|
| `pass` (default) | no | **pass** |
| `pass` (default) | yes | **fail** (carries the `FailureArtifact`) |
| `fail` | yes (and message-substring matches, if given) | **pass** — expected failure occurred; artifact still captured |
| `fail` | yes but message-substring given and absent | **fail** — the actual `FailureArtifact` is captured; the message mismatch is noted |
| `fail` | no | **fail** — `kind: "unexpected-pass"` |

The `FailureArtifact` is captured into `trace.json` in all failing cases,
including a satisfied expected-failure (so the structured diff is conformance-
checked across languages).

## Canonicalization rules

What makes the JSON diff-identical across languages:

- Sorted keys, 2-space indent, LF endings, trailing newline.
- Integers only for spans (offset/line/col); no floats, no locale.
- Paths: bundle-relative POSIX; step-def files referenced by **stem** (`steps.ts`
  and `steps.py` both serialize as `steps`).
- `contextKey` is structural `{ exampleName, stepFile }` — never an instance id.
- **No** timestamps, absolute paths, instance ids, or error-message strings in
  compared fields.
- Deterministic ordering: examples in document order, steps in execution order,
  registry in registration order, diagnostics sorted by span.

## Components

All but the harness live in `@oselvar/var`.

1. **Projection functions (new `conformance.ts`, pure).** `toVarDocArtifact`,
   `toRegistryArtifact`, `toPlanArtifact`, `toTraceArtifact`, plus
   `canonicalStringify` enforcing the formatting rules. These *define* the
   artifact shape and become the reference each port reimplements (the input to
   Sub-project 3's porting skill).
2. **Instrumented conformance ports.** A recording `TestSink` + `Reporter` + a
   context factory that tags each context with its structural `contextKey`.
   `executePlan` already accepts these ports, so the trace is assembled by
   feeding it instrumented adapters — no change to the executor itself.
3. **TS harness (vitest, in repo).** Iterates `conformance/bundles/*`, imports
   each `steps.ts`, builds the registry, runs the pipeline, projects the four
   artifacts, and compares to `golden/*.json`. An `--update` (env flag) path
   writes goldens instead of comparing — TS is the reference generator.
4. **Thin CLI (optional, can defer).** `var conformance <bundle> [--update]`
   wrapping the same core functions, for CI and cross-language debugging later.

## Data flow

```
example.var.md ──parse──────────────────> VarDoc ─────────> var-doc.json
steps.ts ──import (registers)──> Registry ────────────────> registry.json
VarDoc + Registry ──plan─────────────> ExecutionPlan ─────> plan.json
ExecutionPlan ──executePlan(instrumented ports)──> events ─> trace.json
                                              compare ▲ vs golden/*.json
```

## Verification mechanism

For each bundle the harness produces the four artifacts and asserts deep
equality against the committed goldens. A mismatch fails the test and prints the
field-level diff. `--update` regenerates goldens from the TS reference; the diff
is reviewed in the PR, which is how an intentional behaviour change is recorded.

## Testing & landing on trunk

The harness is a new CI test suite. Because every current parse/plan/execute
behaviour is pinned by committed goldens, any future core change that shifts
behaviour surfaces as a reviewable golden diff — hardening TypeScript trunk
immediately, before any second language exists. The minimal expected-error
feature is itself developed TDD (parser recognises the `error` fence; planner
sets `expectedOutcome`; `executePlan` applies the inversion and emits
`unexpected-pass`).

## Future (out of scope here)

- **Static extraction conformance** (source-range goldens) once tree-sitter
  lands (Sub-project 2).
- **Cross-repo corpus sharing** (git submodule or published package) once a port
  lives in its own repo (Sub-project 4).
- **Structured expected-error matching** — assert specific expected `CellDiff`s
  for an expected failure, beyond a message substring.
