# var-pytest plugin + shared var-runner (sub-project 2 of the Python port)

Date: 2026-06-30
Status: design, pending implementation (TDD)

Second sub-project of the Python port ([issue #2](https://github.com/oselvar/var/issues/2),
[ADR 0001](../../adr/0001-second-language-python.md)). The pure Python core landed in
sub-project 1 ([`2026-06-30-python-core-port-design.md`](2026-06-30-python-core-port-design.md))
and passes full conformance parity. This sub-project adds the **ergonomic pytest plugin**
that runs Markdown specs as first-class pytest tests, plus a small **shared `var-runner`**
package holding the spec-running orchestration that the later unittest adapter will reuse.

Scope is **pytest (v1) + `var-runner` only**. The **unittest adapter** is a separate later
cycle (it reuses `var-runner` behind a different runner binding). Full pytest **fixture
lifecycle/finalizers** per example are explicitly out of v1 (see Fixture bridge).

## Why this scope

ADR 0001 names the runtime/test-runner adapter as the per-language seam and makes pytest
the primary, ergonomic target (Python's center of gravity). The pure core is proven; this
binds it to pytest so `pip install pytest-var` turns `.md` specs into real, individually
reported tests. Splitting the shared orchestration into `var-runner` keeps the core pure
(hexagonal) and lets unittest reuse the exact same run path.

## Architecture — packages

Three layers, file I/O and runner types confined to the outer two:

```
var          # pure core (done): parse → plan → execute, define_state, diffs, to_failure
var-runner   # NEW shared imperative shell: discovery + import + run_spec → results
var-pytest   # NEW pytest binding: pytest11 plugin, collection, fixture bridge, rendering
```

- **`var-runner`** (dist `oselvar-var-runner`) depends only on `var`. It is the *only*
  place that touches the filesystem and imports step modules. It exposes:
  - `load_steps(step_globs, root) -> Registry` — reset the builder, import each matching
    `*.steps.py` module (so `define_state` registers), `build_registry()`, return it.
    Also returns the per-stepfile context factory (`context_factory()`).
  - `find_specs(vars_include, vars_exclude, root) -> tuple[Path, ...]` — glob spec files.
  - `run_spec(source, path, registry, create_context, *, run_example) -> SpecRun` — parse →
    plan → `collect_examples`, exposing each example as a runnable unit with its
    `PlannedExample` (name, span) so the caller (pytest) creates one test per example and
    drives execution, capturing the raised diff/`to_failure` result as a structured,
    span-anchored failure.
  - `read_var_config(pyproject_path) -> VarConfig` — parse `[tool.var]` (below).
  - The exact decomposition of these (especially how `run_spec` hands per-example `run()`
    callables to the runner so pytest controls timing/fixtures) is settled in the plan; the
    contract is: `var-runner` owns parse/plan/registry/discovery, the runner owns
    per-example execution + reporting.
- **`var-pytest`** (dist `pytest-var`) depends on `var-runner` + `pytest`. Ships a
  `pytest11` entry point so install is the whole setup. Contains only pytest glue.

## Config & discovery — `[tool.var]`

A `[tool.var]` table in `pyproject.toml`, mirroring `var.config.ts` (the single source of
truth for "what is a spec"):

```toml
[tool.var]
vars = { include = ["features/**/*.md"], exclude = ["**/wip/**"] }
steps = ["tests/steps/**/*.steps.py"]
# scanner_plugins = ["gherkin_tables"]   # deferred; only if a spec needs it
```

- `vars` is `{ include, exclude }` (a bare list is include-only shorthand), both plain
  globs (no `!` prefix) — identical semantics to the TS config. `include` has no default
  (empty discovers nothing); `exclude` removes matches.
- **No `.var.md` extension.** A `.md` file is a spec **iff its path matches the `vars`
  globs** — consistent with the project-wide glob-driven model (CLAUDE.md).
- `steps` globs locate `*.steps.py` step modules.
- Config is resolved relative to the `rootdir` pytest reports (the dir containing
  `pyproject.toml`).

**Spec identification in pytest:** `pytest_collect_file(file_path, parent)` fires for every
walked file. The plugin returns a `VarFile(pytest.File)` **iff** `file_path` is a `.md` whose
path matches the resolved `vars` globs; otherwise `None` (pytest's default collection
continues). This is strictly better than the vitest side, which must register `.md` paths in
config — here collection is automatic.

**Step discovery:** in `pytest_configure`, the plugin calls `var-runner.load_steps(...)`
once per session (reset builder → import step modules → build registry), caching the
registry + context factory on the session for `VarFile` collection to use.

## Collection → one item per example

```
features/calculator.md::adds two numbers   PASSED
features/calculator.md::divides by zero    FAILED
```

- `VarFile.collect()`: read the `.md` source, `var-runner` parses + plans it, and yields one
  `VarItem(pytest.Item)` per `PlannedExample`.
- Each `VarItem` is independently `-k`/node-id selectable, xdist-distributable, and counted.
- `VarItem.reportinfo()` returns `(self.path, example.span.start_line, example.name)` so the
  test location points into the `.md`.
- `VarItem.runtest()` drives that single example's execution through the core
  (`execute_plan` over just this example's plan, or the per-example `run()` from
  `collect_examples`), with the ports wired to the plugin (context factory from
  `load_steps`; a fixture-resolving handler layer, below).

## Fixture bridge — plain `getfixturevalue` (v1)

Step handlers keep the core contract: `def _(state, *expression_captures) -> partial|None`
(context/action) or `-> value` (sensor). The bridge is purely additive:

- **Param classification by position:** `param[0]` is `state`; the next *N* params are the
  matched expression's captures (*N* = the expression's parameter count); any **remaining
  params are pytest fixtures**, resolved by name.
- **Mechanism (core stays unchanged):** after `build_registry()`, the plugin produces a
  registry whose handlers are **wrapped**. The wrapper exposes the `(state, *args)` signature
  the core calls; at call time it inspects the original handler's signature, treats trailing
  params as fixture names, resolves each via `request.getfixturevalue(name)`, and calls
  `original(state, *args, **resolved)`. The **active item's `request`** is exposed via a
  `contextvar` set in `VarItem.runtest()` and read by the wrapper — so the shared registry
  works across examples while each call resolves against the right request.

```python
@action("I persist the order")
def _(state, db, tmp_path):          # 0 captures → db, tmp_path are pytest fixtures
    db.save(state["order"], tmp_path)

@sensor("the total is {int}")
def _(state, total, clock):          # 1 capture (total) → clock is a fixture
    return state["total"]
```

- **v1 limitation (deliberate):** fixtures are resolved via `getfixturevalue`, which honours
  fixture *setup* and caching, but there is **no per-example finalizer lifecycle** —
  function-scoped fixtures are not torn down between examples within a file. Per-example
  setup/teardown uses the `define_state` factory (fresh context per example) plus pytest's
  native `beforeEach`/`afterEach`-style fixtures at the file/module level. Full per-example
  fixture lifecycle is a deferred enhancement (would require each `VarItem` to drive pytest's
  fixture machinery as a true function-scoped item).

## Failure rendering & async

- **Markdown-anchored failures.** When an example fails, the core raises a diff error
  (`CellMismatchError` / `DocStringMismatchError` / `ReturnShapeError`) or an arbitrary
  handler exception. `VarItem.repr_failure()` renders the span-anchored diff — expected vs
  actual located at the failing cell/doc-string span — **against the `.md` source**, so the
  reported location is the markdown, not adapter internals. Reuse the core's `to_failure` /
  the structured diff payloads (the emerging shared run-result format). An **undefined step**
  or a **shape error** renders as an actionable message (and, where the core offers it, a
  pasteable Python step snippet — the per-language generation port; snippet generation itself
  is deferred unless trivially available).
- **Async steps** work transparently — the core executor already drives both `def` and
  `async def` handlers (via `asyncio`); the plugin does nothing special.

## Testing

- **Plugin behaviour via `pytester`** (pytest's plugin-testing fixture): each test writes a
  tiny `pyproject.toml` `[tool.var]`, a `.md` spec, and a `*.steps.py`, runs a sub-pytest
  session, and asserts: per-example pass/fail counts, node-id selection (`-k`), the
  markdown-anchored failure text (expected/actual + `.md` line), fixture injection (a handler
  consuming `tmp_path` and a custom fixture), async-handler success, undefined-step
  reporting, and `[tool.var]` include/exclude behaviour.
- **`var-runner` unit tests:** discovery (glob include/exclude), `load_steps` registration
  order + reset, `read_var_config` parsing, and `run_spec` producing the right per-example
  results (including a failing example carrying a structured span-anchored failure).
- **Dogfood/integration:** run the existing `conformance/bundles/*` (already `.md` +
  `*.steps.py`) through the plugin via `pytester` and assert the pass/fail outcomes match
  what those bundles' `trace.json` goldens declare (e.g. the expected-failure and
  cell-mismatch bundles fail/pass as specified). This proves the runner path agrees with the
  conformance-proven core end-to-end.
- All green from `python/`: `uv run pytest` and `uv run ruff check`; CI's existing Python
  lane covers it.

## Risks / notes

- **Param classification depends on the expression's capture count.** The wrapper must get
  *N* from the matched step's compiled expression (same source as `parameter_type_names`),
  not by guessing — an off-by-one would misclassify a capture as a fixture. Covered by a
  fixture-bridge `pytester` test with both a captured arg and a fixture on one handler.
- **`contextvar` request scoping** must be set/reset around each `VarItem.runtest()` so
  parallel/xdist runs and nested collection don't cross requests.
- **Registry wrapping** rebuilds an immutable `Registry` with wrapped handlers; ensure the
  wrap preserves `expression`, `compiled`, `kind`, and source provenance (only the handler
  callable changes).
- **Session-scoped registry vs per-test fixtures:** the registry is built once
  (`pytest_configure`); fixtures resolve per example via the contextvar — verify this holds
  under `-p no:cacheprovider` and xdist.

## Open questions (resolve at implementation start)

- The precise `var-runner.run_spec` surface — whether it returns per-example `run()`
  thunks (letting pytest own timing) or takes a `run_example` callback. Lean toward returning
  planned examples + a `run_one(example, ports)` the plugin calls inside `runtest`, so pytest
  controls per-item execution.
- Whether `var-runner` or `var-pytest` owns the handler-wrapping for the fixture bridge.
  Lean: the wrapping is pytest-specific (it needs `request`), so it lives in `var-pytest`;
  `var-runner` exposes a seam to supply a registry/handler-resolver.
- Undefined-step snippet generation: include only if the core already exposes a
  Python-snippet port; otherwise defer (render a plain "undefined step" message).

## References

- [Issue #2 — Python port](https://github.com/oselvar/var/issues/2)
- [ADR 0001](../../adr/0001-second-language-python.md)
- [Python core port design](2026-06-30-python-core-port-design.md)
- Core surfaces: `python/packages/var/src/var/{define_state,parse,plan,execute,failure,result}.py`
- TS reference adapter (shape only): `typescript/packages/var-vitest`
