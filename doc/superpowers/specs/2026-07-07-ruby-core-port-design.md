# Ruby core port — pure runtime core (sub-project 1 of the Ruby port)

Date: 2026-07-07
Status: design, pending implementation (TDD)

First sub-project of the Ruby port ([ADR 0004](../../adr/0004-ruby-port.md)).
Scope is the **pure Ruby runtime core only** — a native port of
`@oselvar/var-core`'s pipeline (including the drift feature) plus the
`@oselvar/var` author facade and the `@oselvar/var-config` reader. The **RSpec**
and **Minitest** adapters ([ADR 0005](../../adr/0005-ruby-test-framework-integration.md))
are deferred to their own sub-project
([`2026-07-07-ruby-rspec-minitest-design.md`](2026-07-07-ruby-rspec-minitest-design.md));
they bind a runner to this proven core and add nothing the conformance suite can
police. Python is the closest precedent throughout (both are dynamically typed
full ports that need the UTF-16 conversion layer); read
[`2026-06-30-python-core-port-design.md`](2026-06-30-python-core-port-design.md)
alongside this.

## Why this scope

The pure core is the foundation the runners sit on, and it has a hard, objective
"done" signal: it reproduces the **existing shared conformance goldens
byte-for-byte** (four artifacts × 15 bundles, plus the config corpus), and — for
drift, which has no golden — reproduces the behaviour of the TS/Python drift
unit tests. Nothing about RSpec/Minitest ergonomics is needed to prove the core
is correct.

## Architecture — a Ruby mirror of the immutable functional core

The Ruby core mirrors `@oselvar/var-core` module-for-module: pure functions over
immutable data — no filesystem, network, globals, or time. The project's
non-negotiables (CLAUDE.md) translate to Ruby idiom as:

- **Immutable types** → plain frozen value objects (`Data.define(...)` for AST /
  plan / diff nodes, frozen on construction; `Struct` only where `Data` doesn't
  fit) and `.freeze`d `Array`/`Hash` for `ReadonlyArray`/`ReadonlyMap`. Updates
  produce new values (`Data#with`).
- **Pure functions** → `parse`, `match`, `plan`, the diffs, drift, and the
  conformance projections: same input → same output, no side effects. Modeled as
  module functions (`module_function`) on stateless modules.
- **Functional core / imperative shell** → `Oselvar::Var::Core` is pure. Module
  loading, the test-runner binding, and file I/O stay out of scope (they are the
  runner/adapter sub-project).
- **Evolving step state** → mirrors `defineState`'s *return-merge* model (below).

Namespace: `Oselvar::Var::Core::*` (core), `Oselvar::Var::*` (facade). Files live
under `ruby/packages/var-core/lib/oselvar/var/core/*.rb`.

## Author API — mirror `define_state` (module-scope accumulator, partial-merge)

Ruby follows the **TS/Python** author-API shape, not the JVM's injected-Registrar
divergence — Ruby is dynamic, so importing a step file for its registration side
effect is idiomatic. `require`-ing a `*.steps.rb` calls `define_state` once and
registers steps into a module-scope accumulator the runner reads.

```ruby
require "oselvar/var"
include Oselvar::Var::DSL   # brings in define_state

stimulus, sensor = define_state { { count: 0 } }

stimulus.("I increment") { |state| { count: state[:count] + 1 } }
sensor.("the count is {int}") { |state, n| state[:count] }
```

- `define_state(param_types = []) { factory } -> [stimulus, sensor]`. Each
  returned callable takes a cucumber expression + a block (the handler). (Block
  form is the Ruby equivalent of TS's `stimulus('expr', handler)`; the block body
  is the handler. The block/method name is never matched.)
- **Evolving state is a `Hash`**: the factory returns a `Hash`; a `stimulus`
  returns a partial `Hash` the runtime shallow-merges into a new state and
  **deep-freezes** (port `deep-freeze.ts` → recursively `freeze` plain
  `Hash`/`Array`, leave other objects live), so a handler can read but never
  mutate. (Hash, not a `Data`, to match TS's open object-shape + `Partial<C>`
  merge.) A `stimulus` returning `nil` means no change.
- A **`sensor`** returns a value the core compares against the Markdown slots
  (the return-based comparison contract in CLAUDE.md), never mutating.
- **One `define_state` per step file**, owning that file's context factory — a
  fresh context per example, contexts never bleed across files (mirrors
  `contextFactoriesByFile`; raise if called twice in one file; bare
  `define_state {}`/`define_state` → empty state).
- **Source location** from `Kernel#caller_locations` at registration, skipping
  frames inside the facade (the Ruby analogue of TS's `callerLocation()`).
- **`define_parameter_type(name, regexp) { |*| transform }`** mirrors the core
  `defineParameterType`; a paired `format` block mirrors bundle 15's custom
  parameter *format*.

## Dependencies

- **Runtime: `cucumber-cucumber-expressions` `20.0.0`** only — exact version
  parity with the TS core's `@cucumber/cucumber-expressions ^20.0.0`, Python's
  `cucumber-expressions==20.0.0`, and Maven's `20.0.0`. **Mind the gem name:**
  the maintained gem is `cucumber-cucumber-expressions` (doubled prefix = org
  namespace + library name); the plain `cucumber-expressions` gem is abandoned
  at 8.3.0 (2019) and must not be used. It exposes `CucumberExpression`,
  `ParameterType`, `ParameterTypeRegistry`, a compiled AST with
  `NodeType::PARAMETER` nodes carrying `start`/`end`, and `Argument`/`Group`
  exposing capture-group `start`/`end` — the same surface the TS/Python matchers
  rely on. Requires Ruby ≥ 2.7; **target Ruby ≥ 3.1** for the port (`Data.define`
  needs 3.2 — if pinning to 3.1, use frozen `Struct`/`Comparable` value objects
  instead; decide in Task 1).
- **Dev:** `rspec` / `minitest` (for the gems' own tests), `rake`, `rubocop` (or
  `standard`) for lint.
- **No** JS, no Node, no sidecar.

## Character offset semantics — UTF-16 (the central conformance concern)

**Every offset in the goldens is a UTF-16 code-unit offset.** The TS scanner
computes positions with `charCodeAt`/`String.length`/`.slice`/regex `.index` —
all UTF-16 code units; `span.ts`'s `lineCol` counts code units. An astral
character (😀 U+1F600) counts as **2**.

Ruby strings are **code-point** indexed (`"😀".length == 1`); UTF-8 bytes are a
third scheme (`.bytesize == 4`). A naive Ruby port counting code points diverges
from the goldens at the first astral character and every span after it — exactly
Python's problem.

**Decision: the Ruby core reproduces UTF-16 code-unit offsets** (same rationale
as Python — the goldens encode them and the consumers are UTF-16). Positions are
tracked/emitted in UTF-16 units throughout, via a single pure helper in
`span.rb`:

- `utf16_len(s)` = `sum(ord > 0xFFFF ? 2 : 1)` over `s.each_char` (or
  `s.encode("UTF-16LE").bytesize / 2`); `to_utf16_offset(source, cp_index) =
  utf16_len(source[0...cp_index])`; the inverse `cp_index_for_utf16`;
  `utf16_slice`; `line_col` counting code units like `span.ts`;
  `span_from_offsets`.
- **The matcher must convert too.** Ruby `MatchData`/cucumber-expressions
  `Group#start`/`#end` are **code-point** indexed, so `matcher.rb` converts every
  `matchStart`/`matchEnd`/`paramSpan` to UTF-16 before building `Hit`s — the
  subtlest spot, gated by `plan.json` on the multibyte bundles.
- **`hash.rb` also iterates UTF-16.** FNV-1a is computed over UTF-16 code units
  (below), a third consumer of the conversion.

Gate the parse stage on bundles **`11-emoji-offsets`** and
**`12-combining-marks`** before declaring it done.

## Canonical JSON — configure the stdlib, then key-sort and newline

`canonical_json.rb` must reproduce `JSON.stringify(sortKeys(v), null, 2) + "\n"`
byte-for-byte. Ruby's stdlib `JSON.pretty_generate` uses 2-space indent and
emits non-ASCII **raw** (good), but does **not** sort keys — so recursively
key-sort the value first, then `JSON.pretty_generate`, then append `"\n"`.
Verify: control-char escaping (`\n \r \t \b \f \" \\` and other control chars)
matches JS, non-ASCII stays raw (no `\uXXXX`), no trailing spaces. Prove
byte-exact against a golden in Task 1; if stdlib output drifts anywhere,
hand-roll the serializer (as Java did). Step-def files serialize by **stem**
(`numerals.steps.rb` → `"numerals.steps"`), so goldens stay shared.

## Module map (`var-core` → `ruby/packages/var-core/lib/oselvar/var/core`)

| Concern              | TS (`var-core/src`)                                   | Ruby (`.../core/…`)                       |
|----------------------|-------------------------------------------------------|-------------------------------------------|
| Positions            | `span.ts`                                              | `span.rb` (+ the UTF-16 helper)           |
| AST                  | `ast.ts`                                               | `ast.rb`                                   |
| Markdown parse       | `scanner.ts`, `structurer.ts`, `inline.ts`, `parse.ts`| `scanner.rb`, `structurer.rb`, `inline.rb`, `parse.rb` |
| Sentences / cells    | `sentences.ts`, `table-cells.ts`                      | `sentences.rb`, `table_cells.rb`          |
| Step roles           | `step-role.ts`                                         | `step_role.rb`                            |
| Registry / author API| `registry.ts` (+ `@oselvar/var` `internal.ts`)        | `registry.rb`, facade `internal.rb`       |
| Matching             | `matcher.ts`                                           | `matcher.rb`                              |
| Planning / diagnostics| `plan.ts`, `diagnostics.ts`                          | `plan.rb`, `diagnostics.rb`               |
| Execution            | `execute.ts`, `deep-freeze.ts`, `deep-equal.ts`       | `execute.rb`, `deep_freeze.rb`, `deep_equal.rb` |
| Diffs / failures     | `cell-diff.ts`, `doc-string-diff.ts`, `param-diff.ts`, `failure.ts`, `result.ts` | `cell_diff.rb`, `doc_string_diff.rb`, `param_diff.rb`, `failure.rb`, `result.rb` |
| Drift                | `drift.ts`, `hash.ts` (+ `BaselineStore` in `ports.ts`)| `drift.rb`, `hash.rb` (+ `baseline_store.rb` port) |
| Conformance          | `conformance.ts` (+ canonical JSON)                   | `conformance.rb`, `canonical_json.rb`     |
| Config (own gem)     | `var-config/src/{config,config-types}.ts`             | `var-config` gem: `config.rb`             |

Out of scope (matches Python): `run-diagnostics`, `snippet*`, `find-files`
(runner concern), scanner *plugins* beyond those a bundle exercises, LSP,
`drift`'s editor quick-fix. The `BaselineStore` port is a bare interface here;
its filesystem implementation lives in `var-runner`.

## Drift — ported, but unit-gated (not golden-gated)

Drift is a pure-core feature with **no conformance golden** (bundles carry no
baseline), so it is proven by **translating `drift.test.ts` + `hash.test.ts`**
into the Ruby suite. Precedent to mirror:
`python/packages/var-core/src/var_core/{drift,hash}.py` and their
`tests/test_{drift,hash}.py`; Java `Drift.java`/`Hash.java` as a cross-check.
See [`2026-07-06-drift-detection-design.md`](2026-07-06-drift-detection-design.md)
and [ADR 0002](../../adr/0002-drift-detection-and-acknowledgment.md). Facts that
must be byte-identical:

- **`hash.rb`** = FNV-1a 32-bit over **UTF-16 code units** → `"fnv1a:<8 hex>"`.
  Ruby needs explicit 32-bit wraparound (`& 0xffffffff`) for JS's `Math.imul`
  multiply, and UTF-16 iteration (reuse `span`'s conversion).
- **`drift.rb`** — `DRIFT_SIMILARITY_THRESHOLD = 0.5`; re-identify a baseline
  example by **Jaccard word-similarity** over lowercased Unicode word tokens
  (`/[\p{L}\p{N}]+/`), tie-broken toward the nearest baseline line; a paragraph
  that was an example and now matches zero steps is drift. Pure functions
  `live_examples`, `derive_spec_baseline`, `detect_drift`, `drift_diagnostics`,
  `reconcile_drift(store:, spec_path:, source:, var_doc:, plan:, update:)`,
  `parse_var_lock`, `stringify_var_lock`. Reports on the shared Diagnostic rail
  (code `drift`, added to `diagnostics.rb`).
- **`var.lock.json` is a SEPARATE serializer from canonical JSON.**
  `stringify_var_lock` = `JSON.pretty_generate(hash) + "\n"` with **spec paths
  sorted** but **insertion-order keys otherwise** (`version, specs`; per spec
  `sourceHash, examples`; per example `name, line`) — NOT the recursive
  alphabetical key-sort of `canonical_json.rb`. Build the hashes in exactly that
  key order (Ruby `Hash` preserves insertion order) so a clean re-run yields no
  diff. `parse_var_lock` is tolerant (malformed → `nil` = "no baseline yet").
- **`BaselineStore` port**: `read -> String|nil`, `write(contents)`. The core
  owns the format; the runner supplies the filesystem implementation.

## Test oracle — conformance goldens, staged by artifact

"Done" (for the golden-gated part) = the Ruby core reproduces every bundle's
committed goldens byte-for-byte. A new Ruby conformance harness (in `ruby/`, an
RSpec spec) iterates `conformance/bundles/*`, and per bundle: `require`s its
`*.steps.rb` to build the registry, reads `example.md`, runs the Ruby pipeline,
projects each artifact via `canonical_json`, and asserts equality against the
**same** `golden/*.json` the TS reference generated. The harness reads the
corpus at `../conformance/bundles` (the Ruby workspace is `ruby/`, sibling of
the corpus). This requires **authoring a `*.steps.rb` fixture per bundle**
(co-located in the neutral corpus, registering the same expressions and
deterministic handlers as `*.steps.ts`).

The four artifacts are four incremental, independently-verifiable milestones —
the plan's spine — followed by the unit-gated drift stage:

1. **`var-doc.json` — parse only.** Scanner/structurer/inline → AST with UTF-16
   spans. The riskiest byte-for-byte surface; where the offset work lands. No
   step fixtures needed yet. Gate on `11`/`12`.
2. **`registry.json` — registration.** `define_state` + cucumber-expression
   compilation → ordered `{expression, parameterTypeNames}` + custom
   `{name, regexp}`. Needs `*.steps.rb` fixtures from here on.
3. **`plan.json` — match + plan.** Matcher (UTF-16 conversion of cucumber
   offsets) + planner → `matchSpan`, `paramSpans`, `matchedExpression`, raw
   `args`, `dataTable`/`docString`, header-bound rows, `error`-fence semantics,
   ambiguity diagnostics.
4. **`trace.json` — execute.** Executor + diffs + expected-failure inversion →
   ordered events, structural `FailureArtifact`s, per-example outcomes (note the
   example-pass/step-fail split for `error` fences).
5. **drift — unit-gated.** `hash.rb` then `drift.rb` + `BaselineStore`; gated by
   the translated `hash`/`drift` unit tests. Runs after trace (`detect_drift`
   consumes an `ExecutionPlan`).

Also gate the **config corpus**: the `var-config` gem reproduces
`conformance/config/cases/*` (8 cases; success → `golden.json`, failure →
`expect-error.txt` marker means loading must raise).

Enforce the purity gate (a Ruby port of `lint_no_reexports`): `var-core` must
have zero `require`s of the facade/runner — grep as a gate.

## Risks

- **Span fidelity (milestone 1).** The port hinges on UTF-16 offsets matching.
  Mitigated by porting the algorithm directly (not a Ruby markdown library), the
  single conversion helper, and the multibyte bundles gating it.
- **Param-span parity (milestone 3).** Relies on Ruby and JS
  `cucumber-expressions` producing identical capture boundaries (same version)
  *after* the code-point→UTF-16 conversion. Validated by `plan.json` on `11`/`12`.
- **Canonical-JSON byte-exactness.** Ruby's `JSON` control-char/Unicode escaping
  must match JS exactly; verified in Task 1, hand-roll if it drifts.
- **`Hash` vs frozen value-object state.** Hash chosen to match TS's `Partial<C>`
  merge; `deep_freeze` must reject mutation to honour immutability.
- **`var.lock.json` key order.** The insertion-order serializer is easy to get
  wrong if built via the canonical (sorting) path; keep the two serializers
  distinct and test byte-stability across a clean re-run.

## Open questions

- Ruby version floor: 3.1 vs 3.2 (`Data.define`) vs 3.3 — confirm at start;
  affects the value-object idiom.
- Whether any bundle exercises a scanner *plugin* (gherkin tables) needing a port
  for milestone 1/3 — audit the corpus during planning.

## References

- [ADR 0004 — Ruby as a supported language](../../adr/0004-ruby-port.md)
- [ADR 0002 — drift detection & acknowledgment](../../adr/0002-drift-detection-and-acknowledgment.md)
- [Python core port design](2026-06-30-python-core-port-design.md) — the closest precedent.
- [Drift detection design](2026-07-06-drift-detection-design.md)
- [Conformance infrastructure design](2026-06-28-conformance-infrastructure-design.md)
- Reference implementation: `typescript/packages/var-core/src/*`,
  `typescript/packages/var/src/internal.ts`; mirror at
  `python/packages/var-core/src/var_core/*`.
