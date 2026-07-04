# var-pytest plugin + var-runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ergonomic `pytest-var` plugin that runs Markdown specs as first-class pytest tests (one item per example, markdown-anchored failures, async, fixture bridge), built on a new shared `var-runner` package (discovery + parse/plan/run orchestration) that the later unittest adapter will reuse.

**Architecture:** Three layers — `var` (pure core, done) → `var-runner` (the only place doing filesystem + step-module import; wraps `parse`/`plan`/`collect_examples` and `[tool.var]` config) → `var-pytest` (thin `pytest11` glue: collection hooks, fixture bridge, `repr_failure`). Tasks 1–5 build `var-runner`; Tasks 6–9 build `var-pytest`.

**Tech Stack:** Python ≥ 3.11, uv workspace at `python/`, `pytest` (runtime dep of var-pytest + test runner), `ruff`, `tomllib` (stdlib). Depends on the in-repo `oselvar-var` core.

## Global Constraints

- **Hexagonal:** `var` core stays pure; ALL filesystem access and step-module import live in `var-runner`/`var-pytest`. Never add I/O to `var`.
- **No `.var.md` extension.** A `.md` file is a spec **iff its path matches the `[tool.var]` `vars` globs** (glob-driven, like `var.config.ts`). `vars` is `{include, exclude}` (bare list = include-only); plain globs, no `!` prefix; `include` empty ⇒ nothing; `exclude` removes matches.
- **One pytest item per example**, independently `-k`/node-id selectable; `reportinfo()` locates it in the `.md`.
- **Fixture bridge (v1):** plain `request.getfixturevalue(name)`; NO per-example finalizer lifecycle. A handler's params are `state`, then the positional args the core passes (expression captures + an optional trailing data-table/doc-string), then **any remaining params are pytest fixtures** — classify by the actual positional-arg count at call time. The `var` core stays unchanged (the plugin wraps handlers).
- **Markdown-anchored failures:** render the core's diff errors (`CellMismatchError`/`DocStringMismatchError`/`ReturnShapeError`) + `to_failure` against the `.md` source.
- Immutable data (frozen dataclasses, tuples). Each task ends green: from `python/`, `uv run pytest` and `uv run ruff check`. Commit per task.
- Distribution names: `oselvar-var-runner` (import `var_runner`), `pytest-var` (import `var_pytest`).

---

## Core surfaces this plan binds to (verified)

- `from var import define_state` ; `from var.define_state import build_registry, context_factory, _reset_builder`.
- `from var.parse import parse` → `parse(path: str, source: str, plugins=()) -> VarDoc`.
- `from var.plan import plan` → `plan(var_doc, registry) -> ExecutionPlan` (`.examples: tuple[PlannedExample]`, `.diagnostics`). `PlannedExample` has `.name`, `.span` (with `.start_line`).
- `from var.execute import collect_examples, CollectPorts, QueuedExample` — `collect_examples(plan, CollectPorts(reporter, create_context, observer=None)) -> tuple[QueuedExample(name, run), ...]` in `plan.examples` order; `run()` is sync (drives async internally) and raises on failure.
- `reporter` is any object with `diagnostic(d)`. `create_context` is `Callable[[step_file:str], state]`.
- Diff errors: `from var.cell_diff import CellMismatchError, is_cell_mismatch_error, ReturnShapeError`; `from var.doc_string_diff import DocStringMismatchError, is_doc_string_mismatch_error`. `from var.failure import to_failure`.
- `Registry`/`StepRegistration` are frozen dataclasses (`var.registry`); `StepRegistration` has `expression, expression_source_file, expression_source_line, handler, compiled, kind`.

---

## File Structure

`python/packages/var-runner/`:
- `pyproject.toml` (dist `oselvar-var-runner`, dep `oselvar-var`)
- `src/var_runner/__init__.py` (re-exports the public API)
- `src/var_runner/config.py` — `VarConfig` + `read_var_config`
- `src/var_runner/discovery.py` — `find_specs`, `match_spec`
- `src/var_runner/steps.py` — `load_steps`
- `src/var_runner/run.py` — `plan_spec`, `examples_with_runs`, `RecordingReporter`
- `src/var_runner/render.py` — `render_failure`
- `tests/` — one `test_<module>.py` each

`python/packages/var-pytest/`:
- `pyproject.toml` (dist `pytest-var`, deps `oselvar-var-runner`, `pytest`; `pytest11` entry point)
- `src/var_pytest/__init__.py`
- `src/var_pytest/plugin.py` — hooks (`pytest_configure`, `pytest_collect_file`), `VarFile`, `VarItem`
- `src/var_pytest/fixtures.py` — handler-wrapping fixture bridge
- `tests/` — `pytester`-based tests + the dogfood integration

Also modify `python/pyproject.toml` `[tool.uv.sources]` to add `oselvar-var-runner = { workspace = true }`.

---

## Task 1: `var-runner` package + `[tool.var]` config

**Files:**
- Create: `python/packages/var-runner/pyproject.toml`, `src/var_runner/__init__.py`, `src/var_runner/config.py`, `tests/test_config.py`
- Modify: `python/pyproject.toml` (add `oselvar-var-runner` workspace source)

**Interfaces (Produces):** `@dataclass(frozen=True) VarConfig(vars_include: tuple[str,...], vars_exclude: tuple[str,...], steps: tuple[str,...], scanner_plugins: tuple[str,...])`; `read_var_config(pyproject_path: str | Path) -> VarConfig`.

- [ ] **Step 1: Create the package skeleton.**

`python/packages/var-runner/pyproject.toml`:
```toml
[project]
name = "oselvar-var-runner"
version = "0.0.0"
description = "Shared spec discovery + run orchestration for var runners"
requires-python = ">=3.11"
dependencies = ["oselvar-var"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var_runner"]
```
`src/var_runner/__init__.py`:
```python
"""Shared imperative-shell orchestration for var test runners."""

__version__ = "0.0.0"
```

- [ ] **Step 2: Write the failing test** `tests/test_config.py`:

```python
from var_runner.config import read_var_config

def _write(tmp_path, body):
    p = tmp_path / "pyproject.toml"
    p.write_text(body, encoding="utf-8")
    return p

def test_reads_include_exclude_and_steps(tmp_path):
    p = _write(tmp_path, """
[tool.var]
vars = { include = ["features/**/*.md"], exclude = ["**/wip/**"] }
steps = ["tests/steps/**/*.steps.py"]
""")
    cfg = read_var_config(p)
    assert cfg.vars_include == ("features/**/*.md",)
    assert cfg.vars_exclude == ("**/wip/**",)
    assert cfg.steps == ("tests/steps/**/*.steps.py",)

def test_bare_list_is_include_shorthand(tmp_path):
    p = _write(tmp_path, '[tool.var]\nvars = ["a/**/*.md"]\n')
    cfg = read_var_config(p)
    assert cfg.vars_include == ("a/**/*.md",) and cfg.vars_exclude == ()

def test_missing_table_is_empty(tmp_path):
    p = _write(tmp_path, "[project]\nname='x'\nversion='0'\n")
    cfg = read_var_config(p)
    assert cfg == read_var_config.__wrapped__ if False else cfg.vars_include == () and cfg.steps == ()
```

- [ ] **Step 3: Run → FAIL** — `cd python && uv run pytest packages/var-runner/tests/test_config.py -q`.

- [ ] **Step 4: Implement** `src/var_runner/config.py`:

```python
from __future__ import annotations
import tomllib
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True, slots=True)
class VarConfig:
    vars_include: tuple[str, ...] = ()
    vars_exclude: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    scanner_plugins: tuple[str, ...] = ()

def read_var_config(pyproject_path: str | Path) -> VarConfig:
    data = tomllib.loads(Path(pyproject_path).read_text(encoding="utf-8"))
    tool_var = data.get("tool", {}).get("var", {})
    vars_field = tool_var.get("vars", {})
    if isinstance(vars_field, list):
        include, exclude = tuple(vars_field), ()
    else:
        include = tuple(vars_field.get("include", []))
        exclude = tuple(vars_field.get("exclude", []))
    return VarConfig(
        vars_include=include,
        vars_exclude=exclude,
        steps=tuple(tool_var.get("steps", [])),
        scanner_plugins=tuple(tool_var.get("scanner_plugins", [])),
    )
```
(Delete the convoluted last assertion in the test — replace with a plain `assert cfg.vars_include == () and cfg.steps == ()`.)

- [ ] **Step 5: Add the workspace source.** In `python/pyproject.toml` `[tool.uv.sources]`, add `oselvar-var-runner = { workspace = true }`. Run `cd python && uv sync`.

- [ ] **Step 6: Run → PASS; `uv run ruff check`. Commit:**
```bash
git add python && git commit -m "feat(py): var-runner package + [tool.var] config"
```

---

## Task 2: `var-runner` spec discovery

**Files:** Create `src/var_runner/discovery.py`, `tests/test_discovery.py`.

**Interfaces (Produces):**
- `find_specs(include: Sequence[str], exclude: Sequence[str], root: Path) -> tuple[Path, ...]` — files under `root` matching any `include` glob, minus any matching an `exclude` glob; sorted; only existing files.
- `match_spec(path: Path, include: Sequence[str], exclude: Sequence[str], root: Path) -> bool` — True iff `path` (relative to `root`) matches an include and no exclude. Used by `pytest_collect_file` per file.

- [ ] **Step 1: Failing test** `tests/test_discovery.py`:

```python
from pathlib import Path
from var_runner.discovery import find_specs, match_spec

def _touch(root, rel):
    p = root / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text("", encoding="utf-8"); return p

def test_find_specs_include_minus_exclude(tmp_path):
    _touch(tmp_path, "features/a.md"); _touch(tmp_path, "features/wip/b.md"); _touch(tmp_path, "README.md")
    found = find_specs(["features/**/*.md"], ["**/wip/**"], tmp_path)
    assert found == (tmp_path / "features/a.md",)

def test_match_spec(tmp_path):
    inc, exc = ["features/**/*.md"], ["**/wip/**"]
    assert match_spec(tmp_path / "features/a.md", inc, exc, tmp_path) is True
    assert match_spec(tmp_path / "features/wip/b.md", inc, exc, tmp_path) is False
    assert match_spec(tmp_path / "README.md", inc, exc, tmp_path) is False
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** using `pathlib.PurePath.full_match` (Python 3.13+) OR `fnmatch`/`glob` — for ≥3.11 use `Path.glob` for `find_specs` and a portable `**`-aware match for `match_spec`:

```python
from __future__ import annotations
from collections.abc import Sequence
from pathlib import Path
from fnmatch import fnmatch

def _rel_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()

def _matches_any(rel: str, globs: Sequence[str]) -> bool:
    # translate ** to match across path separators; fnmatch treats * greedily,
    # so normalise: a leading '**/' optionally matches zero dirs.
    for g in globs:
        if fnmatch(rel, g) or (g.startswith("**/") and fnmatch(rel, g[3:])):
            return True
    return False

def match_spec(path: Path, include: Sequence[str], exclude: Sequence[str], root: Path) -> bool:
    rel = _rel_posix(path, root)
    return _matches_any(rel, include) and not _matches_any(rel, exclude)

def find_specs(include: Sequence[str], exclude: Sequence[str], root: Path) -> tuple[Path, ...]:
    out: set[Path] = set()
    for g in include:
        out.update(p for p in root.glob(g) if p.is_file())
    keep = [p for p in out if not _matches_any(_rel_posix(p, root), exclude)]
    return tuple(sorted(keep))
```
NOTE: `fnmatch` does not treat `**` specially; verify the tests pass and, if `**`-across-dirs is needed beyond the leading-`**/` case, switch to `pathlib.Path.full_match` guarded on `sys.version_info >= (3, 13)` with an fnmatch fallback. Adjust the implementation until both tests are green.

- [ ] **Step 4: Run → PASS; ruff. Step 5: Commit** `feat(py): var-runner spec discovery`.

---

## Task 3: `var-runner` step loading

**Files:** Create `src/var_runner/steps.py`, `tests/test_steps.py`.

**Interfaces (Produces):** `load_steps(step_globs: Sequence[str], root: Path) -> LoadedSteps` where `@dataclass(frozen=True) LoadedSteps(registry: Registry, create_context: Callable[[str], Any])`. It: `_reset_builder()`, imports each file matching `step_globs` under `root` via `importlib.util.spec_from_file_location` with a unique module name (NOT added to `sys.modules`, so re-runs re-execute), then `build_registry()` + `context_factory()`.

**Interfaces (Consumes):** `var.define_state._reset_builder/build_registry/context_factory`; `var.discovery` not needed (glob here directly).

- [ ] **Step 1: Failing test** `tests/test_steps.py`:

```python
from pathlib import Path
from var_runner.steps import load_steps

STEPS = '''
from var import define_state
context, action, sensor = define_state(lambda: {"n": 0})
@action("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    return state["n"]
'''

def test_load_steps_builds_registry_and_context(tmp_path):
    (tmp_path / "calc.steps.py").write_text(STEPS, encoding="utf-8")
    loaded = load_steps(["**/*.steps.py"], tmp_path)
    exprs = [s.expression for s in loaded.registry.steps]
    assert "I add {int}" in exprs and "the total is {int}" in exprs
    # context factory yields the stepfile's fresh state
    ctx = loaded.create_context(str(tmp_path / "calc.steps.py"))
    assert ctx == {"n": 0}

def test_load_steps_resets_between_calls(tmp_path):
    (tmp_path / "a.steps.py").write_text(STEPS, encoding="utf-8")
    load_steps(["**/*.steps.py"], tmp_path)
    loaded2 = load_steps(["**/*.steps.py"], tmp_path)
    assert len(loaded2.registry.steps) == 2  # not 4 — reset cleared the first load
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `steps.py`:

```python
from __future__ import annotations
import importlib.util
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from var.define_state import _reset_builder, build_registry, context_factory
from var.registry import Registry

@dataclass(frozen=True, slots=True)
class LoadedSteps:
    registry: Registry
    create_context: Callable[[str], Any]

def _import_file(path: Path, module_name: str) -> None:
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

def load_steps(step_globs: Sequence[str], root: Path) -> LoadedSteps:
    _reset_builder()
    files: set[Path] = set()
    for g in step_globs:
        files.update(p for p in root.glob(g) if p.is_file())
    for i, path in enumerate(sorted(files)):
        _import_file(path, f"_var_steps_{i}_{path.stem}")
    return LoadedSteps(registry=build_registry(), create_context=context_factory())
```

- [ ] **Step 4: Run → PASS; ruff. Step 5: Commit** `feat(py): var-runner step loading`.

---

## Task 4: `var-runner` run orchestration

**Files:** Create `src/var_runner/run.py`, `tests/test_run.py`.

**Interfaces (Produces):**
- `class RecordingReporter` with `diagnostics: list` and `diagnostic(self, d)` appending.
- `plan_spec(source: str, path: str, registry: Registry) -> ExecutionPlan` = `plan(parse(path, source), registry)`.
- `examples_with_runs(execution_plan, create_context, reporter) -> tuple[tuple[PlannedExample, Callable[[], None]], ...]` — calls `collect_examples(execution_plan, CollectPorts(reporter, create_context))` and zips each `QueuedExample.run` with the matching `PlannedExample` (same order), so a caller (pytest) gets, per example, its planned metadata + a `run()` thunk.

**Interfaces (Consumes):** `var.parse.parse`, `var.plan.plan`, `var.execute.collect_examples/CollectPorts`.

- [ ] **Step 1: Failing test** `tests/test_run.py`:

```python
from pathlib import Path
from var_runner.steps import load_steps
from var_runner.run import plan_spec, examples_with_runs, RecordingReporter

STEPS = '''
from var import define_state
context, action, sensor = define_state(lambda: {"n": 0})
@action("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    if state["n"] != total:
        raise AssertionError(f"expected {total} got {state['n']}")
'''
SRC_PASS = "# Calc\n\n## adds\n\nI add 2\n\nthe total is 2\n"
SRC_FAIL = "# Calc\n\n## adds wrong\n\nI add 2\n\nthe total is 99\n"

def _runs(tmp_path, src):
    (tmp_path / "c.steps.py").write_text(STEPS, encoding="utf-8")
    loaded = load_steps(["**/*.steps.py"], tmp_path)
    plan = plan_spec(src, "c.md", loaded.registry)
    return examples_with_runs(plan, loaded.create_context, RecordingReporter())

def test_passing_example_runs_clean(tmp_path):
    pairs = _runs(tmp_path, SRC_PASS)
    assert len(pairs) == 1
    example, run = pairs[0]
    assert example.name and run() is None     # no raise

def test_failing_example_raises(tmp_path):
    import pytest
    _example, run = _runs(tmp_path, SRC_FAIL)[0]
    with pytest.raises(Exception):
        run()
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `run.py`:

```python
from __future__ import annotations
from collections.abc import Callable
from typing import Any
from var.execute import CollectPorts, collect_examples
from var.parse import parse
from var.plan import ExecutionPlan, PlannedExample, plan
from var.registry import Registry

class RecordingReporter:
    def __init__(self) -> None:
        self.diagnostics: list[Any] = []
    def diagnostic(self, d: Any) -> None:
        self.diagnostics.append(d)

def plan_spec(source: str, path: str, registry: Registry) -> ExecutionPlan:
    return plan(parse(path, source), registry)

def examples_with_runs(
    execution_plan: ExecutionPlan,
    create_context: Callable[[str], Any],
    reporter: Any,
) -> tuple[tuple[PlannedExample, Callable[[], None]], ...]:
    queue = collect_examples(execution_plan, CollectPorts(reporter=reporter, create_context=create_context))
    # collect_examples preserves plan.examples order
    return tuple((ex, q.run) for ex, q in zip(execution_plan.examples, queue, strict=True))
```

- [ ] **Step 4: Run → PASS; ruff. Step 5: Commit** `feat(py): var-runner run orchestration`.

---

## Task 5: `var-runner` failure rendering

**Files:** Create `src/var_runner/render.py`, `tests/test_render.py`.

**Interfaces (Produces):** `render_failure(error: BaseException, source: str, var_path: str) -> str` — a human-readable, markdown-anchored message. For `CellMismatchError`: list each failing cell `column`, `expected`, `actual`, and 1-based `.md` line (from the cell span). For `DocStringMismatchError`: expected/actual + line. For `ReturnShapeError`: its message. For any other exception: `f"{type(error).__name__}: {error}"`. Reuse the diff errors' structured payloads and/or `var.failure.to_failure`.

- [ ] **Step 1: Failing test** `tests/test_render.py` — construct the diff errors directly (import from `var.cell_diff`/`var.doc_string_diff`) with a known span/cells and assert the rendered string contains the expected column/expected/actual and the line number; assert a plain `ValueError("boom")` renders as `ValueError: boom`. (Use the actual constructors from `var.cell_diff`/`var.doc_string_diff` — read those modules for the exact error/payload shape before writing the test.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `render.py` dispatching on `is_cell_mismatch_error` / `is_doc_string_mismatch_error` / `isinstance(error, ReturnShapeError)` / else. Pull line numbers from the error payload spans (`span.start_line`). Keep it a pure function of `(error, source, var_path)`.
- [ ] **Step 4: Run → PASS; ruff. Step 5: Commit** `feat(py): var-runner failure rendering`. Then update `src/var_runner/__init__.py` to re-export `VarConfig, read_var_config, find_specs, match_spec, load_steps, LoadedSteps, plan_spec, examples_with_runs, RecordingReporter, render_failure` and add a one-line test importing them all from `var_runner`.

---

## Task 6: `var-pytest` collection skeleton (items per example)

**Files:** Create `python/packages/var-pytest/pyproject.toml`, `src/var_pytest/__init__.py`, `src/var_pytest/plugin.py`, `tests/test_collection.py`. Modify `python/pyproject.toml` (`oselvar-var-runner` already added; ensure `pytest-var` resolves — add `pytest-var = { workspace = true }` is not needed unless something depends on it).

**Interfaces (Produces):** the `pytest11` plugin: `pytest_configure(config)` reads `[tool.var]` from `config.rootpath/"pyproject.toml"`, calls `load_steps`, and stashes `(config_obj, loaded)` on `config`. `pytest_collect_file(file_path, parent)` returns `VarFile.from_parent(...)` iff `file_path.suffix == ".md"` and `match_spec(...)`. `VarFile.collect()` yields one `VarItem` per `PlannedExample`. `VarItem.runtest()` calls its `run()` thunk; `VarItem.reportinfo()` → `(self.path, line, name)`.

- [ ] **Step 1: Create the package.** `pyproject.toml`:
```toml
[project]
name = "pytest-var"
version = "0.0.0"
description = "pytest plugin for Markdown-native BDD"
requires-python = ">=3.11"
dependencies = ["oselvar-var", "oselvar-var-runner", "pytest>=8"]

[project.entry-points.pytest11]
var = "var_pytest.plugin"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var_pytest"]
```
`src/var_pytest/__init__.py`: `"""pytest plugin for var."""\n\n__version__ = "0.0.0"`. Run `cd python && uv sync`.

- [ ] **Step 2: Write the failing test** `tests/test_collection.py` using the `pytester` fixture (enable it via a `conftest.py` in `var-pytest/tests/` containing `pytest_plugins = ["pytester"]`):

```python
STEPS = '''
from var import define_state
context, action, sensor = define_state(lambda: {"n": 0})
@action("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    assert state["n"] == total, f"expected {total} got {state['n']}"
'''
PYPROJECT = '''
[tool.var]
vars = ["features/**/*.md"]
steps = ["steps/**/*.steps.py"]
'''
SPEC = "# Calc\\n\\n## adds two\\n\\nI add 2\\n\\nthe total is 2\\n\\n## adds wrong\\n\\nI add 2\\n\\nthe total is 9\\n"

def test_one_item_per_example_pass_and_fail(pytester):
    pytester.makepyprojecttoml(PYPROJECT)
    pytester.makefile(".py", **{"steps/calc.steps": STEPS})
    (pytester.path / "features").mkdir()
    (pytester.path / "features/calc.md").write_text(SPEC.replace("\\n", "\n"), encoding="utf-8")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1, failed=1)
    result.stdout.fnmatch_lines(["*features/calc.md::adds two*PASSED*"])

def test_k_selection(pytester):
    pytester.makepyprojecttoml(PYPROJECT)
    pytester.makefile(".py", **{"steps/calc.steps": STEPS})
    (pytester.path / "features").mkdir()
    (pytester.path / "features/calc.md").write_text(SPEC.replace("\\n", "\n"), encoding="utf-8")
    result = pytester.runpytest("-k", "adds two")
    result.assert_outcomes(passed=1)

def test_non_matching_md_is_ignored(pytester):
    pytester.makepyprojecttoml(PYPROJECT)
    (pytester.path / "README.md").write_text("# not a spec\n", encoding="utf-8")
    result = pytester.runpytest()
    result.assert_outcomes()  # nothing collected, no error
```

- [ ] **Step 3: Run → FAIL** (`cd python && uv run pytest packages/var-pytest/tests/test_collection.py -q`).

- [ ] **Step 4: Implement** `src/var_pytest/plugin.py`:

```python
from __future__ import annotations
from pathlib import Path
import pytest
from var_runner.config import read_var_config
from var_runner.discovery import match_spec
from var_runner.run import RecordingReporter, examples_with_runs, plan_spec
from var_runner.steps import LoadedSteps, load_steps

_STASH: dict = {}  # keyed by config id → (VarConfig, LoadedSteps, root)

def pytest_configure(config: pytest.Config) -> None:
    root = Path(config.rootpath)
    cfg = read_var_config(root / "pyproject.toml")
    loaded = load_steps(cfg.steps, root)
    _STASH[id(config)] = (cfg, loaded, root)

def pytest_unconfigure(config: pytest.Config) -> None:
    _STASH.pop(id(config), None)

def pytest_collect_file(file_path: Path, parent: pytest.Collector):
    if file_path.suffix != ".md":
        return None
    cfg, _loaded, root = _STASH[id(parent.config)]
    if not match_spec(file_path, cfg.vars_include, cfg.vars_exclude, root):
        return None
    return VarFile.from_parent(parent, path=file_path)

class VarFile(pytest.File):
    def collect(self):
        _cfg, loaded, root = _STASH[id(self.config)]
        source = self.path.read_text(encoding="utf-8")
        execution_plan = plan_spec(source, self.path.name, loaded.registry)
        pairs = examples_with_runs(execution_plan, loaded.create_context, RecordingReporter())
        for example, run in pairs:
            yield VarItem.from_parent(self, name=example.name, example=example, run=run, source=source)

class VarItem(pytest.Item):
    def __init__(self, *, example, run, source, **kw):
        super().__init__(**kw)
        self._example = example
        self._run = run
        self._source = source
    def runtest(self) -> None:
        self._run()
    def reportinfo(self):
        return self.path, self._example.span.start_line - 1, self._example.name
```

- [ ] **Step 5: Run → PASS; ruff. Step 6: Commit** `feat(py): var-pytest collection (item per example)`.

---

## Task 7: Markdown-anchored failure rendering + diagnostics

**Files:** Modify `src/var_pytest/plugin.py` (add `VarItem.repr_failure` + surface plan diagnostics); add `tests/test_failures.py`.

**Interfaces:** `VarItem.repr_failure(excinfo)` returns `render_failure(excinfo.value, self._source, str(self.path))`. The `VarFile.collect` reporter is kept; if `plan.diagnostics` is non-empty (e.g. ambiguous match), surface them — for v1, if a diagnostic affects an example, that example's `run()` already fails through the core; additionally expose collected diagnostics in the failure text where relevant.

- [ ] **Step 1: Failing test** `tests/test_failures.py` (pytester): a spec whose sensor returns a mismatching table/cell so the core raises `CellMismatchError`; assert the run fails and `result.stdout.fnmatch_lines` contains the expected-vs-actual text AND the `.md` line. Also a spec with an **undefined step** → assert the failure message names the unmatched step text. (Author the spec + steps so the core actually produces these errors — mirror a conformance bundle like 07-row-check-mismatch for the cell case.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `VarItem.repr_failure`:
```python
    def repr_failure(self, excinfo):
        from var_runner.render import render_failure
        return render_failure(excinfo.value, self._source, str(self.path))
```
For undefined steps: a step with no match — confirm how the core signals it (an unmatched step in `plan` yields a diagnostic and the example `run()` raises, OR the planner leaves it unplanned). Read `var.plan`/`var.execute` to see the exact behaviour for an unmatched step, and make `render_failure` (Task 5, extend if needed) produce an actionable "undefined step: <text>" message. Add a `render.py` branch + a `var-runner` unit test if you extend it.
- [ ] **Step 4: Run → PASS; ruff. Step 5: Commit** `feat(py): var-pytest markdown-anchored failures`.

---

## Task 8: Fixture bridge (plain getfixturevalue)

**Files:** Create `src/var_pytest/fixtures.py`; modify `plugin.py` (wrap registry at configure; set the request contextvar in `runtest`); add `tests/test_fixtures.py`.

**Interfaces (Produces):**
- `wrap_registry_for_fixtures(registry: Registry, get_request: Callable[[], Any]) -> Registry` — returns a new `Registry` whose every `StepRegistration` has its `handler` replaced by a wrapper. The wrapper, called as `(state, *args)`, inspects the ORIGINAL handler's signature, treats parameters AFTER the first `1 + len(args)` positional-or-keyword/keyword-only params as fixture names, resolves each via `get_request().getfixturevalue(name)`, and calls `original(state, *args, **resolved)`.
- A module-level `contextvar` `_active_request` and `get_active_request()`.

**RESEARCH STEP (do first):** a plain `pytest.Item` does not automatically have a `FixtureRequest`. Confirm — at the pinned pytest version (`cd python && uv run python -c "import pytest; print(pytest.__version__)"`) — the supported way for a custom `Item` to resolve fixtures via `getfixturevalue`. The likely path: in `VarItem`, build fixture scaffolding in `setup()` using the session's fixture manager and create a request, e.g.
```python
def setup(self):
    fm = self.session._fixturemanager
    self._fixtureinfo = fm.getfixtureinfo(node=self, func=None, cls=None)  # confirm signature
    self.funcargs = {}
    self._request = fixtures.TopRequest(self, _ispytest=True)              # confirm constructor
```
Verify the exact API by reading `_pytest.fixtures` in the installed pytest (`uv run python -c "import _pytest.fixtures as f; help(f.TopRequest)"` or inspect source) and adapt. If `TopRequest`/`getfixtureinfo` signatures differ, use what that version exposes. The `_request.getfixturevalue(name)` call is the stable public surface. If, after genuine effort, per-item fixture requests prove unworkable at this version, STOP and report BLOCKED with findings (the controller may descope the bridge to v2).

- [ ] **Step 1: Failing test** `tests/test_fixtures.py` (pytester): a `conftest.py` defining a custom fixture `db` (returns a list) plus using built-in `tmp_path`; a steps file with `@action("I save {int}")` whose handler is `def _(state, n, db, tmp_path): db.append((n, str(tmp_path)))` and a `@sensor("db has {int} entries")` `def _(state, count, db): return len(db)`; a spec exercising them. Assert the example passes (proving `db`/`tmp_path` were injected and the captured `{int}` still bound positionally). Add a second test where a fixture and a captured arg coexist on one handler to pin the classification.

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `fixtures.py` (`wrap_registry_for_fixtures` via `dataclasses.replace` on each `StepRegistration`, `inspect.signature` for param classification, the contextvar) and wire it in `plugin.py`: in `pytest_configure`, after `load_steps`, replace the stashed registry with `wrap_registry_for_fixtures(loaded.registry, get_active_request)`; in `VarItem.setup`, build the request (per research) and set `_active_request`; in `runtest`/`teardown`, reset the contextvar. Param classification:
```python
import inspect
def _fixture_param_names(fn, n_positional_passed):
    params = list(inspect.signature(fn).parameters.values())
    tail = params[1 + n_positional_passed:]   # skip state + the positional args the core passes
    return [p.name for p in tail
            if p.kind in (p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)]
```
- [ ] **Step 4: Run → PASS; ruff. Step 5: Commit** `feat(py): var-pytest fixture bridge (getfixturevalue)`.

---

## Task 9: Async + dogfood conformance integration

**Files:** Add `tests/test_async.py`, `tests/test_dogfood_bundles.py`.

- [ ] **Step 1: Async test** (pytester): a steps file with an `async def` action returning a partial state and an `async def` sensor; a spec exercising them; assert the example passes (the core drives the coroutine). Write it FIRST, run → it should PASS already if the core's asyncio handling works through the plugin (no plugin change expected). If it fails, fix the plugin's `runtest` to not swallow the async path. Commit `test(py): var-pytest async handlers`.

- [ ] **Step 2: Dogfood test** `tests/test_dogfood_bundles.py` (pytester): for a representative subset of `conformance/bundles/*` (at least `01-roman-numerals` happy-path, `03-expected-failure`, `07-row-check-mismatch`), copy the bundle's `example.md` + `<name>.steps.py` into the pytester tree with a `[tool.var]` pointing at them, run pytest, and assert the outcomes match the bundle's intent (e.g. 03's example is an expected-failure → it should be reported per the plugin's expected-failure handling; 07 → a failure with a cell mismatch). Resolve the bundles dir via `Path(__file__).resolve().parents[N] / "conformance" / "bundles"` (compute N: `python/packages/var-pytest/tests` → repo root). This proves the runner path agrees with the conformance-proven core end-to-end.
  - NOTE on expected-failure: confirm how the plugin should report a bundle whose example declares `expected_outcome="fail"`. The core inverts the outcome (a satisfied expected-failure → the `run()` does NOT raise). So such an example should be reported PASSED by pytest. Assert accordingly. If the bundle has no matching step (e.g. `10-error-fence-without-step`), exclude it from this subset.

- [ ] **Step 3: Run → PASS; ruff. Step 4: Commit** `test(py): var-pytest dogfood conformance bundles`.

- [ ] **Step 5: Final package check.** From `python/`: `uv run pytest -q` (whole workspace green incl. var/var-runner/var-pytest), `uv run ruff check`, and `uv lock --check` (commit `python/uv.lock` if it changed). Commit any lock update: `chore(py): lock var-runner + pytest-var`.

---

## Self-Review

**Spec coverage:**
- `var-runner` shared layer (discovery, load_steps, run_spec orchestration, config) → Tasks 1–5. ✓
- `[tool.var]` glob config, no `.var.md`, include/exclude shorthand → Task 1 + Task 2 + Task 6 (`match_spec` in `pytest_collect_file`). ✓
- One pytest item per example, `-k`/node-id, `reportinfo` into `.md` → Task 6. ✓
- Markdown-anchored failures via core diff errors / `to_failure` → Task 5 (render) + Task 7 (repr_failure). ✓
- Fixture bridge: plain `getfixturevalue`, position-based classification, contextvar request, core untouched, no per-example finalizers → Task 8. ✓
- Async transparency → Task 9 Step 1. ✓
- pytest11 entry point (`pip install pytest-var` is the setup) → Task 6. ✓
- Testing via `pytester` + dogfood of `conformance/bundles` → Tasks 6–9. ✓
- Hexagonal (I/O only in var-runner/var-pytest) → enforced by package boundaries; `var` untouched across all tasks. ✓
- unittest adapter explicitly OUT → not in any task. ✓

**Placeholder scan:** Tasks carry real code for the var-runner layer and the plugin skeleton. Two tasks (7 undefined-step branch, 8 fixture-request construction) contain explicit RESEARCH steps with the exact commands to confirm the pytest/core API before implementing — these are concrete investigation directives (the same pattern used for cucumber-expressions in the core port), not vague "handle it later" placeholders. No "TBD"/"add error handling".

**Type/name consistency:** `LoadedSteps(registry, create_context)` (Task 3) consumed in Tasks 6/8. `examples_with_runs(plan, create_context, reporter) -> ((PlannedExample, run), ...)` (Task 4) consumed in Task 6. `render_failure(error, source, var_path)` (Task 5) consumed in Task 7. `match_spec`/`find_specs` (Task 2) consumed in Task 6. `wrap_registry_for_fixtures(registry, get_request)` + `get_active_request` (Task 8) wired in `plugin.py`. `_STASH[id(config)] = (cfg, loaded, root)` written in Task 6, read consistently. Registry/StepRegistration fields match the verified core surface.

**Known risk carried to execution:** the per-item `FixtureRequest` construction (Task 8) is the one place using pytest internals; the research step pins it, and a BLOCKED escape is defined if it proves unworkable at the pinned version (descope bridge to v2).
