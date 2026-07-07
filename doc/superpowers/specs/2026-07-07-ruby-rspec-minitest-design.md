# Ruby runner + RSpec/Minitest adapters (sub-project 2 of the Ruby port)

Date: 2026-07-07
Status: design, pending implementation (TDD)

Second sub-project of the Ruby port ([ADR 0004](../../adr/0004-ruby-port.md),
[ADR 0005](../../adr/0005-ruby-test-framework-integration.md)). Scope: the shared
`oselvar-var-runner` imperative shell plus **both** test-framework adapters —
`oselvar-var-rspec` and `oselvar-var-minitest`. Depends on the
conformance-green core from
[sub-project 1](2026-07-07-ruby-core-port-design.md). Modeled on
`var-pytest`/`var-unittest` (Python) and `var-runner` (TS/Python/Java).

## Why this scope

The core is proven by conformance; the runner + adapters are proven **through**
it. They are the only place file I/O, step-file loading, and framework binding
live (functional core / imperative shell). Building them after the core is green
means debugging one unknown at a time.

## Architecture — three layers

```
oselvar-var        (pure facade — done)          Oselvar::Var
oselvar-var-config (pure reader — done)          Oselvar::Var::Config
      ▲
oselvar-var-runner (NEW imperative shell)        Oselvar::Var::Runner
      ▲
oselvar-var-rspec  ·  oselvar-var-minitest       Oselvar::Var::RSpec / ::Minitest
```

`var-runner` is the only shell code both adapters share; each adapter is a thin
framework binding with no pipeline logic.

### `var-runner` surface

- **`discovery.rb`** — `find_specs`, `match_spec`, and a hand-rolled
  `glob_to_regex` (`**`/`*`/`?`, `../` support so specs can live outside the
  config root, e.g. the shared corpus), mirroring the Python/TS/Java runners. No
  symlink deref (match by apparent path).
- **`steps.rb`** — `load_steps(step_globs, root)`: `reset_builder`, `require`
  each step file, return `{ registry:, create_context: }` from the facade
  accumulator. `LoadedSteps` value.
- **`run.rb`** — `plan_spec(path, source, registry)` = `plan(parse(...))`;
  `examples_with_runs(plan, create_context, reporter)` pairing each
  `PlannedExample` with a lazy `run` closure; a `RecordingReporter`.
- **`render.rb`** — `render_failure(error, source, path)` dispatching on the
  core's diff/failure types to human-readable, `.md`-anchored text (reusing the
  core's `to_failure`, never re-deriving).
- **`baseline_store.rb`** — a **filesystem `BaselineStore`** implementing the
  core port (`read`/`write` `var.lock.json` at the project root), plus the
  `reconcile_drift` wiring each adapter calls. Precedent:
  `python/packages/var-runner/src/var_runner/baseline_store.py`, TS
  `baseline-store.ts`, Java `BaselineStores.java`.

## Config & discovery

One `var.config.json` per workspace root, read verbatim by `var-config` — the
same canonical keys every port uses (`docs: {include, exclude}` globs, `steps`
glob array, `snippets`, `scannerPlugins`). No Ruby-idiomatic surface (no
`[tool.var]`-style table). A file is a spec iff its path matches the `docs`
globs. For Ruby, `steps` globs point at `*.steps.rb` files the runner `require`s.

## Collection → one item per example

Both adapters generate framework-native tests at load time (Ruby collects no
non-Ruby files — see ADR 0005):

- **RSpec** (`Oselvar::Var::RSpec.generate`, called from `spec/var_spec.rb`):
  one `RSpec.describe` per spec file, the example's scope-stack headings as
  nested `describe`/`context`, one **`it` per planned example** (header-bound
  rows are separate). Each `it` is anchored to `"<spec>.md:<startLine>"` via
  example metadata so re-run (`rspec path:line`), `--example`, and reporting land
  on the Markdown. The `it` body runs the example via `examples_with_runs`.
- **Minitest** (`Oselvar::Var::Minitest.generate_tests(namespace)`, called from
  `test/var_test.rb`): one `Minitest::Test` subclass per spec injected into the
  caller's namespace, one **`test_*` method per example** (identifier-safe name;
  real name in the failure/description). Independently selectable via `-n`.

## Fixture bridge

**Out of scope for v1** (as `var-unittest` deferred it). Handlers receive
`(state, *captures[, trailing table/doc string])` — plain context state from the
per-file factory, threaded by the core executor. If an RSpec `let`/helper bridge
is added later, classify trailing handler params as framework values **by
position** using *N* = the matched expression's actual capture count (from the
compiled expression, not guessed) — an off-by-one misclassifies a capture.

## Failure rendering & async

Failures reuse the core's `to_failure`/diff payloads (`CellMismatchError`,
`DocStringMismatchError`, `ReturnShapeError`, `UnexpectedPassError`) rendered
`.md`-anchored by `render.rb`: RSpec raises
`RSpec::Expectations::ExpectationNotMetError` (a failure), Minitest raises
`Minitest::Assertion`; any other exception propagates as an error. Async is out
of scope (Ruby has no dominant step coroutine convention; handlers are sync).

## Drift gate

Each adapter reconciles every spec against `var.lock.json` through
`baseline_store.rb` + `reconcile_drift`: a `drift` diagnostic (like
`ambiguous-match` / `error-fence-without-step`) surfaces as a failing
example/method so a drifted spec fails the suite; the baseline is written on a
clean run; an `--update`/acknowledgment path re-records and reports nothing
([ADR 0002](../../adr/0002-drift-detection-and-acknowledgment.md) — never
silently accept drift). Precedent: the pytest/unittest/junit/kotest gates.

## Testing

The adapters are **not** re-gated on the four artifacts. Instead:

- **Dogfood/integration**: run `conformance/bundles/*` (already `.md` + the
  `*.steps.rb` fixtures) through each adapter and assert pass/fail outcomes and
  rendered messages match what those bundles' **`trace.json` goldens** declare
  (e.g. bundle 01 passes, 03 expected-failure passes via inversion, 07 fails
  with a cell diff at its line) — mirroring `var-pytest`'s dogfood test.
- **Drift**: a per-adapter drift test with a `var.lock.json` fixture (baseline
  present + reworded/deleted example → drift diagnostic; `update` → re-recorded,
  byte-stable) — mirror `var-pytest/tests/test_drift.py` and `var-kotest`'s
  `kotest-drift/` resources.
- **Collection/failure/diagnostics** unit tests per adapter.

## Risks / notes

- **RSpec `.md`-anchoring** is the subtle part (ADR 0005): overriding an `it`'s
  re-run location to the `.md` line must survive `rspec path:line`/`--example`
  and reporting; verify with the real `examples/ruby-rspec` project.
- **Step-file loading** via `require` must reset the accumulator between runs and
  not leak state across spec files.
- **Glob semantics** (`**`, `../`) must match the other runners' hand-rolled
  regex, not Ruby's `Dir.glob` (differing `**` semantics) — port the algorithm.

## Open questions

- Whether RSpec metadata alone suffices for `.md` re-run anchoring or a custom
  `RSpec::Core::Example` location shim is needed — resolve during implementation.
- Whether the Minitest adapter should also expose an RSpec-style single-entry
  generator vs the namespace-injection form — default to `var-unittest` parity.

## References

- [ADR 0004](../../adr/0004-ruby-port.md), [ADR 0005](../../adr/0005-ruby-test-framework-integration.md),
  [ADR 0002](../../adr/0002-drift-detection-and-acknowledgment.md)
- [var-pytest plugin design](2026-06-30-var-pytest-plugin-design.md)
- Reference adapters: `python/packages/var-pytest`, `python/packages/var-unittest`,
  `python/packages/var-runner`; `java/var-kotest`.
