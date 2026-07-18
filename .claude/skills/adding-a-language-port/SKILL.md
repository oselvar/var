---
name: adding-a-language-port
description: Use when starting or reviewing a new var language port (Java, Kotlin, Go, ...) — porting the pure core, the runner shell, and a test-framework adapter behind the shared conformance suite. Symptoms: "add language X", "port var to X", deciding var-core vs var-runner vs adapter boundaries, or a conformance bundle not matching goldens byte-for-byte.
---

# Adding a language port

## Overview

var is hexagonal + multi-language (ADR 0001). TypeScript is the reference
implementation; **Python, Java, Kotlin, and Ruby are complete ports**. Python
and Ruby are the closest precedents for a *full pipeline* port (no runtime
sharing, like Go would be); Kotlin is the precedent for a *facade over an
existing engine* (it shares the JVM with Java — see the last section). Ruby is
also the precedent for a **block-based author DSL** (`steps(...) do stimulus …
sensor … end`) and, unlike the older ports, shipped with its tree-sitter
dialect wired from the start (see the repo-integration checklist). Every port follows the
same package shape and is proven correct by reproducing the shared
`conformance/bundles/*/golden/*.json` byte-for-byte — never by writing fresh
tests against a new spec (the one carve-out is **drift**, which is unit-gated —
see its stage below).

Two docs are the primary source for this skill and are worth reading in full
before starting a new port, not just skimming this summary:

- `doc/adr/0001-second-language-python.md` — the seams table (shared vs.
  per-language), the tree-sitter/LSP direction, the conformance strategy.
- `doc/superpowers/specs/2026-06-30-python-core-port-design.md` and
  `doc/superpowers/specs/2026-06-30-var-pytest-plugin-design.md` — the
  concrete design the Python port followed, plus their matching plans in
  `doc/superpowers/plans/` (including `2026-06-30-python-core-split.md`,
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

## The package shape

Every language ends up with (at least) these packages — same names as
TypeScript/Python, translated to the target ecosystem's naming idiom. A port
that ships two adapters (e.g. Python's pytest + unittest) is **six packages**,
not four:

| Package | Depends on | Owns | Never touches |
|---|---|---|---|
| `<lang>-core` (e.g. `var-core` / `var_core`) | nothing runtime-ish | pure pipeline: parse → match → plan → execute, diffs, drift, conformance projections | filesystem, network, globals, time, test-framework types |
| `<lang>` facade (e.g. `@oselvar/var` / `var`) | `<lang>-core` | author API only: `defineState`/`define_state` (context/action/sensor), `registry` glue subpath | pipeline internals directly (goes through core) |
| `<lang>-config` (e.g. `@oselvar/var-config` / `var_config`) | nothing (pure) | the `var.config.json` reader — strict, fail-loud; its own conformance corpus | filesystem beyond reading the one config file |
| `<lang>-runner` (e.g. `var-runner`) | facade + config + core | imperative shell: spec/step discovery (globs), `load_steps`, `run_spec`/`plan_spec`, failure rendering, the filesystem `BaselineStore` (drift) | any one test framework's types |
| `<lang>-<framework>` (e.g. `var-vitest`, `var-pytest`) | `<lang>-runner` | one test-framework binding: collection (one test item per example), fixture/DI bridging, reporting, the drift gate | pipeline logic (delegates to runner/core) |

`var-config` is a **distinct shared package**, not folded into the runner — it
has its own byte-for-byte conformance corpus at `conformance/config/cases/`
(see below). `var-core`/`var` were originally one package in Python and were
later split to mirror this shape exactly (see the "split" plan) — **start a new
port already split**, don't repeat that refactor.

## Process (mirrors the Python precedent)

1. **ADR** only if *which* language is still an open strategic question —
   skip if already decided. (Java and Kotlin are done; a *new* language whose
   selection isn't obviously implied by ADR 0001 — e.g. Ruby, which ADR 0001
   explicitly set aside as the second language — still warrants a short ADR
   recording why it's being picked up now.)
2. **Design spec doc(s)** in `doc/superpowers/specs/YYYY-MM-DD-<lang>-*.md`.
   Split into the same two sub-projects Python used: (a) the pure core +
   facade, (b) the runner + one test-framework adapter. Each doc names the
   exact TS source module it's porting — a port translates the cited
   algorithm, it does not redesign it.
3. **Task plan doc(s)** in `doc/superpowers/plans/YYYY-MM-DD-<lang>-*.md`,
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
   **Cucumber-expressions is a *library dependency*, not a hand-port.** Depend
   on the official cucumber-expressions package for the target language, pinned
   to the **same version every other port uses** (currently `20.0.0` — TS
   `@cucumber/cucumber-expressions@^20.0.0`, PyPI `cucumber-expressions==20.0.0`,
   Maven `io.cucumber:cucumber-expressions:20.0.0`, RubyGems
   `cucumber-cucumber-expressions` — mind ecosystem naming quirks). Do **not**
   reimplement the expression grammar/regex generation; the `matcher` module
   ports only var's own hit-resolution, ambiguity detection, and offset-shifting
   *around* the library. Parameter-type names come from the compiled expression
   AST (parameter nodes), never parsed from `{...}`; a custom type's `regexp`
   serializes as its bare source.
3. **`plan.json`** — matching + planning (per-step match/param spans, data
   table/doc string attachment, `error`-fence → expected-failure semantics,
   ambiguity diagnostics).
4. **`trace.json`** — execution (return-merge state, diffs, structured
   `FailureArtifact`s, per-example outcomes).
5. **drift (unit-gated, NOT golden-gated)** — port `hash` (FNV-1a over UTF-16
   code units → `fnv1a:<8 hex>`; drift depends on it) then `drift` + the
   `BaselineStore` port. Drift re-identifies examples by Jaccard word-similarity
   (`DRIFT_SIMILARITY_THRESHOLD = 0.5`, ported byte-identically), flags a
   paragraph that *was* an example and now matches zero steps, reports on the
   Diagnostic rail (code `drift`), and persists a `var.lock.json` baseline.
   **This stage has no conformance golden** (bundles carry no baseline), so it
   is the one core feature proven by **translating the unit tests**
   (`hash.test.ts`, `drift.test.ts`) rather than reproducing goldens. Note
   `var.lock.json` uses its *own* serializer — `JSON.stringify(_, null, 2) +
   "\n"` with spec paths sorted but **insertion-order keys otherwise**
   (`version, specs`; per spec `sourceHash, examples`; per example `name,
   line`) — NOT the recursive alphabetical key-sort of `canonical_json`. Drift
   is already ported to TS, Python, and the JVM; follow the closest precedent
   (`python/packages/var-core/src/var_core/{hash,drift}.py`, Java
   `Drift.java`/`Hash.java`).

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

**Library vs. hand-roll.** A language with a conformant stdlib JSON writer
(TS `JSON.stringify`, Python `json.dumps`, Ruby `JSON`) still cannot use it
raw — none sort keys recursively, and you must append the trailing `\n`
yourself. Configure the stdlib writer (2-space indent, non-ASCII raw) and wrap
it with your own recursive key-sort. A language with no conformant writer (Java
has none in the stdlib) hand-rolls the whole serializer — port the algorithm,
don't pull in Jackson/Gson. Either way, prove it byte-exact against a golden in
the first task.

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
conformance, hash, drift` — plus the `BaselineStore` port interface and the
facade module (`internal`/`define_state`) holding `defineState` and the
module-scope accumulator. (`hash` + `drift` are the drift feature — see stage
5; they *are* required, they're just unit-gated rather than golden-gated.)

Each module's TS source file **and** its `*.test.ts` are the authoritative
spec — translate the test first (watch it fail), then the implementation.

Not everything under `typescript/packages/var-core/src/` belongs on this
list: files like `config.ts` and `find-files.ts` are `var-config`/runner
concerns, and `ports.ts` declares the port interfaces (`TestSink`, `Reporter`,
`BaselineStore`) that adapters implement. If a `.ts` file in that directory
isn't in the list above and doesn't have a
`python/packages/var-core/src/var_core/*.py` counterpart, don't assume it needs
porting for v1 — confirm against the design docs first. (`hash.ts` *used* to be
on the "skip for v1" list; drift promoted it to required.)

## Author-API fork points (decide explicitly, don't copy blindly)

The facade shape is **not** identical across ports — these decisions legitimately
fork on the target language's idioms. Record your choice in the design doc:

- **Registration mechanism.** TS/Python use a **module-scope mutable
  accumulator**: importing a `*.steps` file runs `define_state(...)` for its
  side effect, and the runner reads the accumulator (`_resetBuilder` between
  runs). Java/Kotlin deliberately diverged to an **injected-per-run Registrar**
  — `StepDefinitions.defineSteps(registrar)` is replayed against a fresh sink
  each run, no global mutable state — because the JVM has no clean
  import-for-side-effect story. Dynamic languages (Ruby, Python) can take the
  accumulator; stricter ones often want the injected Registrar.
- **State evolution.** TS/Python thread a **shallow partial-merge** state (a
  `stimulus` returns a `Partial<C>`/dict that's merged over the running state).
  Java/Kotlin use **full-replacement immutable value** state (a `stimulus`
  returns the whole next state). This changes the executor's merge step and the
  sensor slot contract, so decide it in Task 1 — it's the single biggest
  author-API fork.
- **Step source location (file/line).** The registry records each step's source
  `file`/`line`; the file's *stem* becomes the trace's `stepFile` (shared
  cross-language, so it must be the canonical `<name>.steps` stem, not the
  physical path). TS/Python read it automatically from the imported module
  (`Error().stack`). A port with an **injected Registrar** (no import) should use
  the language's native **call-site capture** rather than making authors pass
  `file`/`line` per step: Rust marks `stimulus`/`sensor` `#[track_caller]` and
  reads `Location::caller()` — because its conformance fixtures are real
  `<name>.steps.rs` files reached via `#[path]`, `file_stem` of that path yields
  the canonical stem for free (`line` is diagnostic-only — in no golden). Reach
  for hand-passed identifiers only if the language has no call-site-location
  facility.
- **Handler shape (arity).** A handler is `(state, …captures) → partial|value`.
  Don't make authors name the arity or wrap the closure if the language can infer
  it. Rust uses an `IntoHandler<Args>` trait (the axum/bevy pattern) with one impl
  per capture-count, so `sensor("…", |state, a| …)` infers each `Value` parameter
  from the bare closure — while an already-built handler (async, variadic, or a
  no-op) passes through a `Handler`-typed impl. Keep explicit fixed-arity/variadic
  constructors in the *core* for its own tests; the closure sugar belongs in the
  *facade*. (The 3+-capture and async forms stay explicit — a bare 2-arg closure
  can't disambiguate `(Value,Value)` from `(Value,Vec)`.)

## Test-framework adapter pattern

Modeled on `var-vitest` (TS), `var-pytest`/`var-unittest` (Python), and
`var-junit`/`var-kotest` (JVM). **Each framework needs its own
integration-mechanism decision recorded as an ADR** (the precedent is
`doc/adr/0003-java-junit-integration.md`, which chose a custom JUnit Platform
`TestEngine`). The contract that decision must satisfy is identical everywhere —
*one independently selectable/reportable test per Markdown example, failures
anchored to the `.md` span* — but the mechanism differs per framework: a custom
TestEngine (JUnit), a `pytest_collect_file` hook (pytest), a generated
`TestCase` subclass per spec (unittest), a `FunSpec` subclass (Kotest), etc.

- **Collection**: one test item per *example* (not per file), independently
  selectable/reportable, with the item's location pointing at the `.md`
  source line, not adapter internals.
- **Discovery/config**: one `var.config.json` per workspace root, shared
  verbatim across every port — canonical keys `docs: {include, exclude}`
  (globs; no special file extension, a file is a spec iff its path matches
  the `docs` globs), `steps` (a glob array), `snippets`, and `scannerPlugins`
  (plugin name strings, resolved to functions per-language via a name
  registry). The schema lives at `conformance/config/var.config.schema.json`.
  Each port reads the same JSON with its own small config package
  (`@oselvar/var-config` in TypeScript, `var_config` in Python, `var-config`
  in Java) — do not invent an ecosystem-idiomatic surface (no `[tool.var]`
  table, no per-language field names); a new port's reader must reproduce
  the shared conformance corpus at `conformance/config/cases/*/golden.json`
  byte-for-byte before it's considered done.
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
- **Drift gate**: each adapter reconciles every spec against `var.lock.json`
  via the runner's filesystem `BaselineStore` + `reconcileDrift`, surfaces a
  `drift` diagnostic on the same Diagnostic rail as `ambiguous-match` (a drifted
  example fails the suite), writes the baseline on a clean run, and honours an
  `--update`/acknowledgment path (ADR 0002 — never silently accept drift). Add
  a per-adapter drift test with a `var.lock.json` fixture (precedent:
  `var-pytest`/`var-unittest` `tests/test_drift.py`, `var-kotest`'s
  `kotest-drift/` resources).

## Repo integration checklist

Beyond the packages, every port wires the same mechanical scaffolding into the
monorepo — easy to forget because none of it is exercised by the conformance
suite:

- **`<lang>/` workspace** at the repo root, using that ecosystem's workspace
  tool (pnpm / uv / Maven reactor / Bundler `path:` gems).
- **Root `Makefile` target** (`make <lang>`) running that port's full gate
  (build + tests + lint + the example projects), threaded into `check:`. Update
  the Makefile header comment.
- **Repo-root `README.md` build & coverage table** — add the port. The table is
  **generated** by `scripts/coverage-summary.sh` between the `<!-- coverage:start
  -->`/`<!-- coverage:end -->` markers, so add the port *there*, not by hand
  editing the table (a hand edit is overwritten on the next `make coverage`): a
  `<PORT>_JSON=$(port_json <id> "<Label>" "$(lcov_totals <report>)")` line (add it
  to the `jq --slurpfile` list too) and a `build_badge` case mapping the id to the
  port's `.github/workflows/<lang>.yml`. Also bump the "N ports" prose sentence.
- **`.github/workflows/<lang>.yml`** — triggered on `<lang>/**`,
  `conformance/**`, `examples/**`, and the workflow file; runs the same gate as
  the Makefile target, then the example projects.
- **Standalone `examples/<lang>-<framework>/` consumer projects** — one per
  adapter, **not** workspace members: they depend on the released (or
  locally-installed) artifacts exactly like a user's project, carry their own
  `var.config.json`, and implement the feature-covering subset (`hello-var`,
  `deep-thought`, `tables-and-docstrings`, `yahtzee`, `roman-numerals`). Their
  `.md` specs are symlinks to the `typescript-vitest` originals (the release
  sync dereferences them). Add rows to `examples/README.md`.
- **`release/targets/NN-<registry>.sh`** publishing the port's packages to its
  registry (npm / PyPI / Maven Central / RubyGems), plus adding the port to the
  release channels. The `oselvar/var-examples` sync (`60-var-examples.sh`) picks
  up new `examples/<lang>-*` projects, but its **version-pinning rewrite is
  per-ecosystem** — add a pin block (and any lockfile exclusion) for a new
  registry, mirroring the npm/PyPI/Maven/RubyGems ones. Also extend the
  `release/lint-commits.sh` consumer-scope regex + message and `cliff.toml`'s
  section map with the new scope.
- **Repo-root `languages.json`** (the single source of truth for the display /
  scaffold axis): add an entry with the language's `label`, seti `icon`, step
  file `ext`, `stepsGlob`, `hasCli`, and install/scaffold/run command blocks.
  The website (`site-lang.ts`), the pre-paint restore script in
  `astro.config.mjs`, and the get-started install tabs (`LangCommand.astro`) all
  derive from it. Add the id to the `SiteLang` union in `site-lang.ts` too.
- **Website docs code tabs**: add a `<TabItem label="<Language>">` to every
  `<Tabs syncKey="lang">` group across `reference/*` and `how-to/*` (and the
  get-started steps tabs), sourcing correct snippets from the new port's example
  and conformance step files. The label must match `languages.json` exactly.
- **Front-page `<Editor>` examples**: the interactive editors in
  `typescript/packages/website/src/components/examples/*.astro`
  (DeepThought/Library/RomanNumerals) hard-code one `<File uri="…">` tab per
  language, imported `?raw` from the `examples/<lang>-*` project. Add a `<File>`
  (steps, plus the logic file where the other languages have one) for the new
  language's `.<ext>` to each editor. This is a *distinct* surface from the docs
  `<Tabs>` above and is the one most often forgotten — but `Editor.astro` now
  asserts at build time that every port in `languages.json` has a code tab, so a
  missing one is a hard build error (message names the language). It's caught in
  the PR gate because `make typescript` / the CI `test` job build the website
  (`pnpm --filter @oselvar/website... build`); run either to surface what you owe.
- **CodeMirror editor highlighting**: add the language's syntax highlighter to
  `CM_LANGUAGE` in `typescript/packages/website/src/lib/cm-languages.ts` — an
  official `@codemirror/lang-<lang>` (Lezer, like ts/java/python) if one exists,
  else a `StreamLanguage.define(<legacy-mode>)` from `@codemirror/legacy-modes`
  (like kotlin/ruby). `CM_LANGUAGE` is a `Record<SiteLang, …>`, so a missing port
  is a type error; `tests/cm-languages.test.ts` also asserts every `SiteLang` has
  a working highlighter, so it's a red test in the `pnpm check` gate (the website
  itself isn't type-checked in CI, so that test — not tsc — is the enforcement).
- **Tree-sitter dialect** (the LSP/editor authoring surface — a *required*
  deliverable now, not deferred): create
  `typescript/packages/var-language/src/tree-sitter-dialects/<lang>.ts`
  (a `LanguageSpec`: step-def + parameter-type queries, `decodeString`,
  `extractHandlerParams`, `resolveRegexp`) with queries **verified empirically**
  against the real grammar's node shapes, then wire it into
  `tree-sitter-scanner.ts` (`SPECS` + `EXTENSIONS` + the `LanguageId` union in
  `tree-sitter-dialects/types.ts`), **both** grammar loaders
  (`var-lsp/src/node-grammar-loader.ts`, `var-language/tests/test-grammar-loader.ts`),
  and the VS Code bundler's copy list (`var-vscode/esbuild.mjs`); add the grammar
  package to `var-language` (devDep) + `var-lsp` (dep) + both `knip.json`
  `ignoreDependencies` blocks. Prove it with a matcher in
  `extraction-conformance.test.ts` (the dialect must yield the identical
  `(kind, expression)`/`(name, regexp)` sets as TypeScript on every bundle's
  `*.steps.<ext>`) plus a `tree-sitter-scanner-<lang>.test.ts`. **Precedent:
  Ruby** (`tree-sitter-dialects/ruby.ts`) — the cleanest full example, including
  a block-DSL query and single/double-quote string decoding.

The **`language-coverage.test.ts` drift gate** (var-language) enforces the last
three bullets: it fails until the new language's extension maps to a wired
tree-sitter dialect, the grammar loaders/bundler agree, and every lang tab group
lists the language. Run it (or `make typescript`) to find what you still owe.

## Config conformance corpus (a distinct byte-for-byte gate)

`var-config` has its own corpus at `conformance/config/cases/*/`, separate from
`conformance/bundles/`. Each case holds a `var.config.json` plus either a
`golden.json` (parse succeeds → project to the canonical shape, serialize with
your `canonical_json`, byte-compare) or an `expect-error.txt` marker (loading
must **raise** — the txt is human-only, not asserted). Reproduce all cases
(currently 8: `empty-object, full, invalid-json, minimal, no-config-file,
null-values, unknown-key, wrong-type`) before the config reader is "done".

## What's shared — don't reimplement per language

Per ADR 0001's seam table, these stay **single-implementation** regardless of
how many languages exist; a new port does not touch them:

| Layer | Status |
|---|---|
| Markdown example parser → AST | Shared (each language's *core* still runs its own parse — "shared" means shared *algorithm*/spec, proven via conformance, not shared code across runtimes) |
| Cucumber-expression matching semantics | Shared **library** — depend on the official cucumber-expressions package pinned to the same version (20.0.0) every port uses; do not hand-port the grammar |
| Step-definition **extraction** from host source for the LSP | **Per-language tree-sitter dialect** — built for TS, Python, Java, Kotlin, and Ruby; a new port adds one (see the repo-integration checklist, enforced by `language-coverage.test.ts`). The scanner core, the `LanguageSpec` seam, and the grammar loaders are shared |
| LSP feature functions, editor integration | Shared TS layer; the only per-language piece is the tree-sitter dialect above |
| Snippet / step-def generation | Per-language port, but deferred unless trivially available — don't block the runtime port on it |

## Out of scope for a v1 port

- LSP feature functions / VS Code / website integration **beyond the
  tree-sitter dialect** — the dialect itself is now a standard port deliverable
  (see the repo-integration checklist), but the rest of the LSP/editor layer
  stays shared TS.
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
| What's shared vs. per-language, and why Python? | `doc/adr/0001-second-language-python.md` |
| How was the pure core scoped/staged? | `doc/superpowers/specs/2026-06-30-python-core-port-design.md` |
| What does the task-by-task TDD execution look like? | `doc/superpowers/plans/2026-06-30-python-core-port.md` |
| How is core/facade split, and why? | `doc/superpowers/plans/2026-06-30-python-core-split.md` |
| How does the runner + test-framework adapter fit together? | `doc/superpowers/specs/2026-06-30-var-pytest-plugin-design.md` |
| Reference implementation (engine) | `typescript/packages/var-core/src/*.ts`, completed mirror at `python/packages/var-core/src/var_core/*.py` |
| Reference implementation (facade) | `typescript/packages/var/src/{index,internal,registry}.ts`, `python/packages/var/src/var/{__init__,internal,registry}.py` |
| Reference implementation (runner) | `typescript/packages/var-runner/src/*.ts`, `python/packages/var-runner/src/var_runner/*.py` |
| Reference implementation (test-framework adapter) | `typescript/packages/var-vitest/src/*.ts`, `python/packages/var-pytest/src/var_pytest/*.py` |
| Reference implementation (drift, unit-gated) | `typescript/packages/var-core/src/{drift,hash}.ts` + `tests/{drift,hash}.test.ts`; mirror at `python/packages/var-core/src/var_core/{drift,hash}.py`; `java/var-core/.../{Drift,Hash}.java` |
| The conformance corpus + goldens | `conformance/bundles/*/{example.md, *.steps.{ts,py,kt,rb}, *Steps.java, golden/*.json}` — 15 bundles, four artifacts each; **plus** the config corpus `conformance/config/cases/*/{var.config.json, golden.json|expect-error.txt}` |

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
  checked against every language's fixture — don't fork it per language. (The
  sole exception is **drift**, which has no golden — there you *do* translate the
  TS unit tests, `hash.test.ts`/`drift.test.ts`.)

## Full port vs. facade over an existing engine (RESOLVED by Kotlin)

Some ports don't re-port the pipeline at all. The rule, now settled:

- A new language that **shares a runtime with an existing port** can be a thin
  **facade over that port's engine** — no second pipeline, no full four-artifact
  conformance run. **Kotlin did exactly this over Java**: `var-kotlin`
  (`com.oselvar.varkt`) is an author-facade + Kotest adapter sitting on the
  compiled Java `var-core`; both are JVM bytecode. Its conformance scope is the
  **registry stage only** (its `*.steps.kt` fixtures prove registration);
  parse/plan/trace stay proven by the Java engine's already-green corpus.
- A language with **no runtime interop** with any existing port (TypeScript,
  Python, and a future Ruby/Go) must do a **full pipeline port** against the TS
  reference, gated on all four artifacts.

So the decision is mechanical: *does the target language share a runtime with an
already-ported one?* If yes, consider the facade route and write it down in the
design doc (registry-only conformance). If no, it's a full port. For a Java →
Kotlin-style pairing, still decide **before** starting the first of the two
which one owns the engine.
