---
name: adding-a-language-port
description: Use when starting or reviewing a new var language port (Java, Kotlin, Go, ...) — porting the pure core, the runner shell, and a test-framework adapter behind the shared conformance suite. Symptoms: "add language X", "port var to X", deciding var-core vs var-runner vs adapter boundaries, or a conformance bundle not matching goldens byte-for-byte.
---

# Adding a language port

## Overview

var is hexagonal + multi-language (ADR 0001). TypeScript is the reference
implementation; Python is the second port and the completed precedent this
skill generalizes from. Every port follows the same four-package shape and is
proven correct by reproducing the shared `conformance/bundles/*/golden/*.json`
byte-for-byte — never by writing fresh tests against a new spec.

Two docs are the primary source for this skill and are worth reading in full
before starting a new port, not just skimming this summary:

- `docs/adr/0001-second-language-python.md` — the seams table (shared vs.
  per-language), the tree-sitter/LSP direction, the conformance strategy.
- `docs/superpowers/specs/2026-06-30-python-core-port-design.md` and
  `docs/superpowers/specs/2026-06-30-var-pytest-plugin-design.md` — the
  concrete design the Python port followed, plus their matching plans in
  `docs/superpowers/plans/` (including `2026-06-30-python-core-split.md`,
  which lives in `plans/`, not `specs/`) showing the actual task-by-task
  execution.

## When to use

- Starting a new language port and need to scope the work into sub-projects.
- Deciding whether something belongs in `<lang>-core`, `<lang>` (facade),
  `<lang>-runner`, or the test-framework adapter.
- A ported module's conformance golden doesn't match and you need to know
  which artifact stage (var-doc/registry/plan/trace) is at fault.
- Reviewing a new port's package layout or PR for architectural drift from
  the established shape.

## The four-package shape

Every language ends up with (at least) these packages — same names as
TypeScript/Python, translated to the target ecosystem's naming idiom:

| Package | Depends on | Owns | Never touches |
|---|---|---|---|
| `<lang>-core` (e.g. `var-core` / `var_core`) | nothing runtime-ish | pure pipeline: parse → match → plan → execute, diffs, conformance projections | filesystem, network, globals, time, test-framework types |
| `<lang>` facade (e.g. `@oselvar/var` / `var`) | `<lang>-core` | author API only: `defineState`/`define_state` (context/action/sensor), `registry` glue subpath | pipeline internals directly (goes through core) |
| `<lang>-runner` (e.g. `var-runner`) | facade + core | imperative shell: spec/step discovery (globs), config parsing, `load_steps`, `run_spec`/`plan_spec`, failure rendering | any one test framework's types |
| `<lang>-<framework>` (e.g. `var-vitest`, `var-pytest`) | `<lang>-runner` | one test-framework binding: collection (one test item per example), fixture/DI bridging, reporting | pipeline logic (delegates to runner/core) |

`var-core`/`var` were originally one package in Python and were later split to
mirror this shape exactly (see the "split" plan) — **start a new port already
split**, don't repeat that refactor.

## Process (mirrors the Python precedent)

1. **ADR** only if *which* language is still an open strategic question —
   skip if already decided (Java, then Kotlin, are already chosen).
2. **Design spec doc(s)** in `docs/superpowers/specs/YYYY-MM-DD-<lang>-*.md`.
   Split into the same two sub-projects Python used: (a) the pure core +
   facade, (b) the runner + one test-framework adapter. Each doc names the
   exact TS source module it's porting — a port translates the cited
   algorithm, it does not redesign it.
3. **Task plan doc(s)** in `docs/superpowers/plans/YYYY-MM-DD-<lang>-*.md`,
   TDD task-by-task (write the translated unit test, watch it fail, port the
   module, gate on conformance, commit). **REQUIRED SUB-SKILL:**
   superpowers:executing-plans or superpowers:subagent-driven-development to
   run the plan.
4. **Execute** one module at a time, gated by the four conformance artifacts
   in order (below) — never jump ahead to `trace.json` before `var-doc.json`
   is solid; each stage depends on the previous one being byte-exact.

## Conformance-driven staging (the spine)

"Done" for the core = every bundle's four artifacts match the committed
goldens byte-for-byte. Stage the work in this order, each an independently
gated milestone:

1. **`var-doc.json`** — parse only (scanner/structurer/inline → AST + spans).
   No registry needed yet, so no `steps.<ext>` fixtures required for this
   stage.
2. **`registry.json`** — step registration (author API + cucumber-expression
   compilation → `{expression, parameterTypeNames}`). From here on every
   bundle needs a **`steps.<ext>` fixture** authored in the new language,
   co-located in `conformance/bundles/<n>/`, registering the same expressions
   and deterministic handlers as the existing `*.steps.ts`.
3. **`plan.json`** — matching + planning (per-step match/param spans, data
   table/doc string attachment, `error`-fence → expected-failure semantics,
   ambiguity diagnostics).
4. **`trace.json`** — execution (return-merge state, diffs, structured
   `FailureArtifact`s, per-example outcomes).

The first three stages each have a named projection function
(`toVarDocArtifact`, `toRegistryArtifact`, `toPlanArtifact`) in
`typescript/packages/var-core/src/conformance.ts` — port each exactly; it
defines the wire shape the goldens were generated from. The trace stage has
no separate `toTraceArtifact`; it's built inline inside `runConformance` in
the same file (the executor's recorded events projected directly) — look
there, not for a same-named function.

## Canonical JSON wire format (non-negotiable, all languages)

The serializer that turns pipeline output into what's compared against
`golden/*.json` must produce, byte-for-byte:

- Recursively **key-sorted** objects.
- **2-space indent**, array/object formatting matching
  `JSON.stringify(value, null, 2)`.
- **LF** line endings, **trailing newline**.
- Non-ASCII emitted **raw** (not `\uXXXX`-escaped) — emoji/CJK/accents appear
  literally.
- Step-def files referenced **by stem**, not extension — `numerals.steps.ts`
  and `numerals.steps.py` both serialize as `"numerals.steps"`, so goldens
  are shared across every language's fixture for the same bundle.

## The portability gotcha: string offset units

Every span's `startOffset`/`endOffset`/`startCol`/`endCol` in the goldens is a
**UTF-16 code-unit offset** (an astral character like 😀 counts as 2) —
because that's what JS strings natively are, and it's also LSP's default
position encoding.

- **Python** needed a whole conversion layer (`utf16_len`, `to_utf16_offset`,
  a running-cursor scanner, converting the regex/cucumber-expressions
  code-point match offsets to UTF-16 before building spans) because Python
  strings are code-point indexed. This was the single riskiest part of the
  Python port.
- **JVM languages (Java, Kotlin) likely need none of this** — `char`/`String`
  on the JVM is already UTF-16 code-unit indexed, same as JS. Don't assume
  it, though: **verify** against conformance bundles `11-emoji-offsets` and
  `12-combining-marks` (astral chars, BMP multi-byte, combining marks) before
  declaring the parse stage done. If your language's native string indexing
  differs from UTF-16 (byte-indexed like Go/Rust, code-point like Python),
  budget real time for a conversion layer; if it matches (Java/Kotlin/C#),
  the parse stage should be comparatively cheap.

## Module map template

Port these engine modules (TypeScript names in `var-core/src/*.ts`; Python
translated them to snake_case 1:1 — use whatever the target language's
convention is, but keep names *parallel* for reviewability):

`span, ast, inline, table_cells, sentences, scanner, structurer, parse,
step_role, registry, matcher, plan, diagnostics, execute, deep_freeze,
cell_diff, doc_string_diff, param_diff, failure, result, canonical_json,
conformance` — plus the facade module (`internal`/`define_state`) holding
`defineState` and the module-scope accumulator.

Each module's TS source file **and** its `*.test.ts` are the authoritative
spec — translate the test first (watch it fail), then the implementation.

Not everything under `typescript/packages/var-core/src/` belongs on this
list: files like `config.ts`, `find-files.ts`, `ports.ts`, `hash.ts`, and
`node.ts` are TS-runner/ports concerns (or not yet mirrored in the Python
port at all) rather than pure-pipeline modules. If a `.ts` file in that
directory isn't in the list above and doesn't have a `python/packages/var-core/src/var_core/*.py`
counterpart, don't assume it needs porting for v1 — confirm against the
design docs first.

## Test-framework adapter pattern

Modeled on `var-vitest` (TS) and `var-pytest` (Python):

- **Collection**: one test item per *example* (not per file), independently
  selectable/reportable, with the item's location pointing at the `.md`
  source line, not adapter internals.
- **Discovery/config**: mirrors `var.config.ts` — `vars: {include, exclude}`
  (bare array = include-only shorthand) plus a `steps` glob. No special file
  extension; a file is a spec iff its path matches the `vars` globs. Give
  this the idiomatic config surface for the ecosystem (Python used a
  `[tool.var]` table in `pyproject.toml`) but keep the field names/semantics
  identical.
- **Fixture/DI bridge** (if the framework has one): handlers keep the core
  signature `(state, *expression_captures) -> partial|None|value`. Classify
  trailing parameters as framework fixtures/injected values **by position**,
  using *N* = the matched expression's actual capture count (from the
  compiled expression, not guessed) — an off-by-one misclassifies a capture
  as a fixture. Wrap the registry's handlers rather than changing the core
  contract.
- **Failure rendering**: reuse the core's `to_failure`/diff payloads
  (`CellMismatchError`, `DocStringMismatchError`, `ReturnShapeError`,
  `UnexpectedPassError`) and render them anchored to the `.md` span — never
  re-derive failure text from scratch in the adapter.
- **Async**: if the language has an async/coroutine convention, the executor
  should drive it transparently; the adapter needs no special casing.

## What's shared — don't reimplement per language

Per ADR 0001's seam table, these stay **single-implementation** regardless of
how many languages exist; a new port does not touch them:

| Layer | Status |
|---|---|
| Markdown example parser → AST | Shared (each language's *core* still runs its own parse — "shared" means shared *algorithm*/spec, proven via conformance, not shared code across runtimes) |
| Cucumber-expression matching semantics | Shared spec (same expression grammar/version across languages) |
| Step-definition **extraction** from host source for the LSP | Per-language, but **not yet built for any language beyond TS** — out of scope for a v1 runtime port |
| LSP feature functions, editor integration | TS/shared-layer only today; a tree-sitter adoption ADR is a placeholder, not yet implemented |
| Snippet / step-def generation | Per-language port, but deferred unless trivially available — don't block the runtime port on it |

## Out of scope for a v1 port

- LSP / VS Code / website integration (TS-only today).
- Snippet/step-def generation.
- Full per-example fixture-lifecycle teardown in the adapter — Python's
  pytest plugin explicitly deferred this (fixtures resolve via
  `getfixturevalue`, no per-example finalizer). Treat as a nice-to-have, not
  a v1 requirement, unless the target framework makes it free.
- A CLI (`var-cli`) — TS-only so far, not part of the core/runner/adapter
  chain other ports need.

## Quick reference: files to read first

| Question | Read |
|---|---|
| What's shared vs. per-language, and why Python? | `docs/adr/0001-second-language-python.md` |
| How was the pure core scoped/staged? | `docs/superpowers/specs/2026-06-30-python-core-port-design.md` |
| What does the task-by-task TDD execution look like? | `docs/superpowers/plans/2026-06-30-python-core-port.md` |
| How is core/facade split, and why? | `docs/superpowers/plans/2026-06-30-python-core-split.md` |
| How does the runner + test-framework adapter fit together? | `docs/superpowers/specs/2026-06-30-var-pytest-plugin-design.md` |
| Reference implementation (engine) | `typescript/packages/var-core/src/*.ts`, completed mirror at `python/packages/var-core/src/var_core/*.py` |
| Reference implementation (facade) | `typescript/packages/var/src/{index,internal,registry}.ts`, `python/packages/var/src/var/{__init__,internal,registry}.py` |
| Reference implementation (runner) | `typescript/packages/var-runner/src/*.ts`, `python/packages/var-runner/src/var_runner/*.py` |
| Reference implementation (test-framework adapter) | `typescript/packages/var-vitest/src/*.ts`, `python/packages/var-pytest/src/var_pytest/*.py` |
| The conformance corpus + goldens | `conformance/bundles/*/{example.md, *.steps.ts, *.steps.py, golden/*.json}` |

## Common mistakes

- **Redesigning instead of translating.** The TS module is the behavioural
  spec; a "cleaner" reimplementation that doesn't reproduce the exact
  algorithm will drift from the goldens in subtle cases.
- **Skipping the per-bundle `steps.<ext>` fixtures.** Stages 2–4
  (registry/plan/trace) can't be gated without them — author before wiring
  the harness for that stage, not after.
- **Assuming your language needs (or doesn't need) UTF-16 conversion without
  checking.** Verify against bundles `11-emoji-offsets` and
  `12-combining-marks` either way.
- **Leaking engine imports into the facade or vice versa.** `<lang>-core`
  must have zero imports of the facade/runtime — grep for it as a gate, the
  way the Python split plan did (`grep -rn "from var\b" <core-src>` → empty).
- **Building the adapter before the core is conformance-green.** The runner
  and adapter are validated *through* the proven core; building them first
  means debugging two unknowns at once.
- **Hand-writing new conformance tests instead of reusing the shared
  corpus.** The whole point of the corpus is one set of expectations
  checked against every language's fixture — don't fork it per language.

## For a Java → Kotlin sequence specifically

If Kotlin follows Java shortly after, decide **before** starting Java whether
Kotlin will (a) port independently against the same TS reference like every
other language, or (b) consume Java's `<lang>-core` directly (both compile to
JVM bytecode, so a Kotlin facade could sit on the Java engine without a
separate port). Option (b) is not what Python/TypeScript did for each other
and would be a new pattern — treat it as a decision to write down explicitly
in the design doc, not something to improvise mid-port.
