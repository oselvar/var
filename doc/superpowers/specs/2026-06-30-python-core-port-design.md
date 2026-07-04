# Python core port — pure runtime core (sub-project 1 of the Python port)

Date: 2026-06-30
Status: design, pending implementation (TDD)

First sub-project of the Python port ([issue #2](https://github.com/oselvar/var/issues/2),
[ADR 0001](../../adr/0001-second-language-python.md)). Scope is the **pure Python
runtime core only** — a native port of `@oselvar/var-core`'s pipeline plus the
`@oselvar/var` author facade. The **pytest plugin** and **unittest adapter** from
issue #2 are deliberately deferred to their own later sub-projects; they bind a
runner to this proven core and add nothing the conformance suite can police.

The repository was just restructured (see
[`2026-06-29-multi-language-repo-restructure-design.md`](2026-06-29-multi-language-repo-restructure-design.md)):
the Python tree lives at `python/` (uv workspace), the TypeScript reference at
`typescript/`, and the language-neutral conformance corpus at root `conformance/`.
A skeleton `python/packages/var` already exists (importable, green smoke test).

## Why this scope

The pure core is the foundation the runners sit on, and it has a hard, objective
"done" signal: it reproduces the **existing shared conformance goldens
byte-for-byte**. The TypeScript implementation is the reference; the Python core
passes when its four projected artifacts equal the committed `golden/*.json` for
every bundle. Nothing about the pytest/unittest ergonomics is needed to prove the
core is correct.

## Architecture — Pythonic mirror of the immutable functional core

The Python `var` package mirrors `@oselvar/var-core` module-for-module: pure
functions over immutable data — no filesystem, network, globals, or time. The
project's non-negotiables (CLAUDE.md) translate to Python idiom as:

- **Immutable types** → `@dataclass(frozen=True, slots=True)` for every AST / plan
  / diff node; `tuple[...]` for `ReadonlyArray<T>`; `Mapping` /
  `types.MappingProxyType` for `ReadonlyMap<K, V>`. Updates produce new values.
- **Pure functions** → `parse`, `match`, `plan`, the diffs, the conformance
  projections: same input → same output, no side effects.
- **Functional core / imperative shell** → the `var` package is pure. Module
  loading, the test-runner binding, and file I/O stay out of scope (they are the
  later pytest/unittest sub-projects).
- **Evolving step state** → mirrors the current `defineState` *return-merge*
  model, not issue #2's stale `@step`/`ctx.result=…` mutation model (see below).

## Author API — mirror `defineState`, not issue #2's `@step`

The current TypeScript author API is `defineState` with **return-based immutable
state**: a stepfile calls `defineState(factory)` once and receives
`{ context, action, sensor }`. `context`/`action` handlers receive the immutable
state plus the expression's captured args and **return a partial state** that the
runtime shallow-merges into a new deep-frozen state (or return nothing for no
change); they never mutate. A `sensor` is a pure observer that **returns a value**
the core compares against the Markdown. Issue #2's decorator/mutation sketch
predates this and is superseded.

Python equivalent:

```python
from var import define_state

context, action, sensor = define_state(lambda: {"count": 0})

@action("I increment")
def _(state):
    return {"count": state["count"] + 1}

@sensor("the count is {int}")
def _(state, n):
    return state["count"]            # compared to the row/cell in the Markdown
```

- `define_state(factory, param_types=None) -> (context, action, sensor)`. The
  three returned callables are **decorators** taking a Cucumber expression; the
  decorated function is the handler. (Decorator form is the Pythonic equivalent of
  TS's `context('expr', handler)` call — the function body is the handler either
  way. The function name is never matched; `def _` is idiomatic.)
- **Evolving state is a `dict`**: the factory returns a `dict`; context/action
  return a partial `dict`; the runtime shallow-merges into a new state and
  **deep-freezes** it (port `deep-freeze.ts` → recursively wrap mappings in
  `MappingProxyType` and forbid mutation), so a handler can read but never mutate.
  (Dict, not a dataclass, to match TS's open object-shape + `Partial<C>` merge.)
- **One `define_state` per stepfile**, owning that file's context factory — a
  fresh context per example, contexts never bleed across stepfiles (mirrors
  `contextFactoriesByFile`).
- **Source location** from `fn.__code__.co_filename` / `co_firstlineno` — no
  stack-string parsing (cleaner than TS's `callerLocation()`).
- **`define_parameter_type(name, regexp, transformer=identity)`** mirrors the
  core `defineParameterType`.

## Dependencies

- **Runtime: `cucumber-expressions==20.0.0`** only — exact version parity with the
  TS core's `@cucumber/cucumber-expressions ^20.0.0`. It is a native Python
  package (PyPI, pure Python, zero JavaScript), maintained in cucumber's polyglot
  monorepo to match the JS edition's semantics. This is the conformance-safe
  choice: the same expression spec family the reference uses.
- **Dev:** `pytest`, `ruff` (already in the `python/` workspace).
- **No** JS, no Node, no sidecar, no other runtime dependency.

## Character offset semantics — UTF-16 (the central conformance concern)

**Every offset in the existing goldens is a UTF-16 code-unit offset.** The TS
scanner computes positions with `charCodeAt`, `String.length`, `.slice`, and
regex `.index` — all UTF-16 code units. `span.ts`'s `lineCol` counts code units.
So a span's `startOffset`/`endOffset` (and `startCol`/`endCol`) count UTF-16 code
units, where an astral character (e.g. 😀 U+1F600) counts as **2**.

Python strings are **code-point** indexed (😀 counts as 1); UTF-8 bytes would be a
third scheme (😀 = 4). A naive Python port counting code points diverges from the
goldens at the first astral character and every span thereafter.

**Decision: the Python core reproduces UTF-16 code-unit offsets.** Rationale: the
goldens already encode them, and the span consumers are UTF-16 — the website
CodeMirror is JS, and the shared LSP layer uses LSP's default UTF-16 position
encoding. Changing the canonical unit would mean rewriting the TS reference,
regenerating all goldens, and changing every span consumer — fighting the grain.

Implementation rule: positions are tracked/emitted in UTF-16 units throughout.

- A single pure helper converts a Python code-point index in `source` to its
  UTF-16 offset: `utf16_len(s) = sum(2 if ord(c) > 0xFFFF else 1 for c in s)`;
  `to_utf16_offset(source, cp_index) = utf16_len(source[:cp_index])`. The scanner
  advances offsets by the UTF-16 width of consumed text rather than by code-point
  count; `line_col` counts code units like `span.ts`.
- **The matcher must convert too.** Python's `cucumber-expressions` returns
  argument group offsets as **code-point** indices (Python `re`), so the matcher
  port converts every `matchStart`/`matchEnd`/`paramSpan` to UTF-16 before
  building `Hit`s. This is the subtlest spot and is gated by `plan.json` goldens
  on the multibyte bundles.

## Module map (`var-core` → `python/packages/var/src/var`)

Port these `@oselvar/var-core` modules (pure pipeline + conformance), keeping
names parallel for reviewability:

| Concern              | TS (`var-core/src`)                                   | Python (`var/…`)                          |
|----------------------|-------------------------------------------------------|-------------------------------------------|
| Positions            | `span.ts`                                              | `span.py` (+ the UTF-16 helper)           |
| AST                  | `ast.ts`                                               | `ast.py`                                   |
| Markdown parse       | `scanner.ts`, `structurer.ts`, `inline.ts`, `parse.ts`| `scanner.py`, `structurer.py`, `inline.py`, `parse.py` |
| Step roles           | `step-role.ts`                                         | `step_role.py`                            |
| Registry / author API| `registry.ts` (+ `@oselvar/var` `internal.ts`)        | `registry.py`, `define_state.py`          |
| Matching             | `matcher.ts`, `expression-segments.ts`                | `matcher.py`                              |
| Planning             | `plan.ts`                                              | `plan.py`                                 |
| Execution            | `execute.ts`                                           | `execute.py`                              |
| Diffs / failures     | `cell-diff.ts`, `doc-string-diff.ts`, `param-diff.ts`, `table-cells.ts`, `failure.ts`, `result.ts` | `cell_diff.py`, `doc_string_diff.py`, `param_diff.py`, `table_cells.py`, `failure.py`, `result.py` |
| Conformance          | `conformance.ts`, `deep-equal.ts` (+ canonical JSON)  | `conformance.py`, `canonical_json.py`     |

Out of scope (authoring/CLI side, not the runtime core): `diagnostics`,
`run-diagnostics`, `snippet*`, `config*`, `find-files`, scanner *plugins* beyond
those a conformance bundle exercises, LSP. `expression-segments.ts` is ported only
as far as the matcher/conformance needs it.

## Test oracle — conformance goldens, staged by artifact

"Done" = the Python core reproduces every bundle's committed goldens byte-for-byte.

A new Python conformance harness (in `python/`, a pytest test) iterates
`conformance/bundles/*`, and for each bundle: imports its `steps.py` to build the
registry, reads `example.md`, runs the Python pipeline, projects the four
artifacts via a Python `canonical_json` serializer enforcing the same
canonicalization rules (sorted keys, 2-space indent, LF, trailing newline,
integers-only spans, bundle-relative POSIX paths, step-def files by **stem** so
`steps.py` and `steps.ts` both serialize as `steps`), and asserts equality against
the **same** `golden/*.json` the TS reference generated. The harness reads the
corpus at `../conformance/bundles` (the Python workspace is `python/`, the corpus
is its sibling at the repo root).

This requires **authoring a `steps.py` fixture per bundle** (today only `steps.ts`
exist), co-located in the neutral corpus, registering the *same* expressions and
deterministic handlers as the `steps.ts`.

The four artifacts are four **incremental, independently-verifiable milestones** —
the plan's spine:

1. **`var-doc.json` — parse only.** The hand-rolled scanner/structurer/inline →
   AST with UTF-16 spans. The riskiest byte-for-byte surface; this is where the
   offset work lands and is proven.
2. **`registry.json` — registration.** `define_state` + cucumber-expression
   compilation → ordered `{expression, parameterTypeNames}` + custom
   `{name, regexp}`. (`provenance` is the non-compared per-language field.)
3. **`plan.json` — match + plan.** Matcher (with UTF-16 conversion of cucumber
   offsets) + planner → per-step `matchSpan`, `paramSpans`, `matchedExpression`,
   raw `args`, `dataTable`/`docString`, diagnostics.
4. **`trace.json` — execute.** Executor + diffs + expected-failure (`error`-fence)
   semantics → ordered events, structural `FailureArtifact`s, per-example
   outcomes.

## Multibyte / offset-fidelity bundles (new corpus bundles)

To pin the UTF-16 offset behaviour the way only real fixtures can, add new
conformance bundles whose `example.md` deliberately contains multi-byte content
**before** the spans under test, so any miscount cascades into a golden mismatch:

- **astral / emoji** (😀, 👨‍👩‍👧 with ZWJ) — surrogate pairs; UTF-16 width 2 each.
- **BMP multi-byte** (café, naïve, CJK 日本語, Greek) — 1 UTF-16 unit but multi-byte UTF-8.
- **combining marks** (e + ́ vs é) — width/normalization edge cases.

Each new bundle ships `example.md`, `steps.ts`, `steps.py`, and **goldens
generated by the TS reference** (`VAR_UPDATE_GOLDENS=1` against the TS harness) so
TS remains the source of truth and Python targets it. Content is curated to
exercise spans in headings, paragraphs/sentences, inline emphasis, table cells,
and parameter captures — the places offsets are emitted. Authoring these bundles +
TS goldens is part of milestone 1.

## Risks

- **Span fidelity (milestone 1).** The whole port hinges on UTF-16 offsets
  matching. Mitigated by porting the algorithm directly (not a different markdown
  library), the single conversion helper, and the multibyte bundles gating it.
- **Param-span parity (milestone 3).** Relies on Python and JS
  `cucumber-expressions` producing identical capture boundaries (same version,
  same spec) *after* the code-point→UTF-16 conversion. Validated by `plan.json`
  goldens on the multibyte bundles.
- **`steps.py` fixtures.** Must register the same expressions/handlers as each
  `steps.ts`, deterministically (no time/randomness/IO).
- **`dict` vs frozen-dataclass state.** Dict chosen to match TS's `Partial<C>`
  merge; deep-freeze must reject mutation to honour immutability.

## Open questions

- Exact public surface of Python `cucumber-expressions` v20 (`CucumberExpression`,
  `ParameterTypeRegistry`, `Argument.group.start/end`, `.value`) — confirm at
  implementation start; the matcher wrapper adapts to it.
- Whether any conformance bundle exercises a scanner *plugin* (e.g. gherkin
  tables) that must be ported for milestone 1/3 — audit the corpus during planning.

## References

- [Issue #2 — Python port](https://github.com/oselvar/var/issues/2)
- [ADR 0001 — Python as the second language](../../adr/0001-second-language-python.md)
- [Conformance infrastructure design](2026-06-28-conformance-infrastructure-design.md)
- [Multi-language repo restructure](2026-06-29-multi-language-repo-restructure-design.md)
- Reference implementation: `typescript/packages/var-core/src/*`, `typescript/packages/var/src/internal.ts`
