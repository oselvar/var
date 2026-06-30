# Python core split (var → var-core + var) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Python `var` package into `var-core` (the pure engine, import `var_core`) + `var` (the thin author facade exporting `define_state`), and apply the Python-side naming/param-order fixes, matching the canonical cross-implementation structure — keeping the shared conformance goldens green throughout.

**Architecture:** Move the 22 engine modules into a new `oselvar-var-core` package (import package `var_core`); the `var` facade keeps only the module-scope accumulator (renamed `internal.py`, mirroring TS `internal.ts`) + a `registry.py` adapter-glue subpath, with `var/__init__.py` re-exporting `define_state`. The author API (`from var import define_state`) is unchanged, so no `*.steps.py` fixtures change. Then fix `plan_spec`/`render_failure` parameter order/names and make `run_conformance` return a typed `BundleArtifacts`.

**Tech Stack:** Python ≥ 3.11, uv workspace at `python/`, pytest, ruff, dep `cucumber-expressions==20.0.0`.

## Global Constraints

- **Conformance stays green, byte-for-byte.** The 48 conformance tests (4 artifacts × 12 bundles) must pass unchanged at every task — renames/moves must NOT change any golden's wire shape (camelCase keys, offsets). Verify after every task.
- **Author API unchanged:** `from var import define_state` keeps working; `conformance/bundles/*/steps.py` and any `*.steps.py` fixtures are NOT edited.
- **Canonical seam:** `var-core` (import `var_core`) = pure engine, no module-scope mutable state, no I/O. `var` (import `var`) = author facade: the accumulator + `define_state` + the glue `build_registry`/`context_factory`/`_reset_builder`.
- **Canonical naming (this sub-project's Python-side fixes):** parameter order is `(path, source)` everywhere; `render_failure(error, source, path)` (was `var_path`); `run_conformance` returns a typed `BundleArtifacts`; `to_plan_artifact`'s parameter is `plan`.
- Immutable data (frozen dataclasses, tuples). Each task ends green: from `python/`, `uv run pytest` and `uv run ruff check`. Commit per task.
- The 22 engine modules: `ast, canonical_json, cell_diff, conformance, deep_freeze, diagnostics, doc_string_diff, execute, failure, inline, matcher, param_diff, parse, plan, registry, result, scanner, sentences, span, step_role, structurer, table_cells`. The facade module is `define_state` (→ becomes `internal`). These two sets are disjoint.

---

## File Structure (target)

`python/packages/var-core/` (dist `oselvar-var-core`, import `var_core`):
- `pyproject.toml`, `src/var_core/__init__.py`
- `src/var_core/<each of the 22 engine modules>.py` — moved from `var`
- `tests/test_<engine modules>.py` — the engine unit tests, moved from `var/tests`

`python/packages/var/` (dist `oselvar-var`, import `var`) — the facade:
- `pyproject.toml` (now depends on `oselvar-var-core`)
- `src/var/__init__.py` → `from var.internal import define_state` (+ `__version__`)
- `src/var/internal.py` → the accumulator + `define_state` + glue (was `define_state.py`)
- `src/var/registry.py` → re-exports `build_registry`, `context_factory`, `_reset_builder` (mirrors TS `@oselvar/var/registry`)
- `tests/test_define_state.py`, `tests/test_conformance.py` — the facade + harness tests (stay here)

Consumers updated: `var-runner` and `var-pytest` depend on `oselvar-var-core` + `oselvar-var`; their `from var.<engine>` imports become `from var_core.<engine>`, and `from var.define_state import build_registry/context_factory/_reset_builder` becomes `from var.registry import …`.

---

## Task 1: Create `var-core`; move the engine + its unit tests

**Files:**
- Create: `python/packages/var-core/pyproject.toml`, `src/var_core/__init__.py`
- Move (git mv): the 22 engine modules `python/packages/var/src/var/<mod>.py` → `python/packages/var-core/src/var_core/<mod>.py`
- Move (git mv): each engine module's unit test `python/packages/var/tests/test_<mod>.py` → `python/packages/var-core/tests/test_<mod>.py` (ALL `test_*.py` EXCEPT `test_define_state.py` and `test_conformance.py`, which stay in `var/tests`)
- Modify: `python/pyproject.toml` (`[tool.uv.sources]` += `oselvar-var-core`), `python/packages/var/pyproject.toml` (dep += `oselvar-var-core`), `python/packages/var/src/var/define_state.py` (imports), `python/packages/var/tests/test_conformance.py` (imports)

**Interfaces:** after this task, the engine is importable as `var_core.<mod>`; `var` still exports `define_state` (now importing the engine from `var_core`).

- [ ] **Step 1: Scaffold `var-core`.** Create `python/packages/var-core/pyproject.toml`:
```toml
[project]
name = "oselvar-var-core"
version = "0.0.0"
description = "Markdown-native BDD — pure functional core engine"
requires-python = ">=3.11"
dependencies = ["cucumber-expressions==20.0.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/var_core"]
```
Create `python/packages/var-core/src/var_core/__init__.py`:
```python
"""Pure functional core engine for var (parse → plan → execute, matcher, diffs, conformance)."""

__version__ = "0.0.0"
```
Add `oselvar-var-core = { workspace = true }` to `python/pyproject.toml` `[tool.uv.sources]`. Add `oselvar-var-core` to `python/packages/var/pyproject.toml` `dependencies`. Run `cd python && uv sync`.

- [ ] **Step 2: Move the 22 engine modules with history.**
```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
mkdir -p python/packages/var-core/src/var_core
for m in ast canonical_json cell_diff conformance deep_freeze diagnostics doc_string_diff execute failure inline matcher param_diff parse plan registry result scanner sentences span step_role structurer table_cells; do
  git mv "python/packages/var/src/var/$m.py" "python/packages/var-core/src/var_core/$m.py"
done
```

- [ ] **Step 3: Rewrite engine cross-imports `var.<mod>` → `var_core.<mod>`** inside the moved modules. Within `python/packages/var-core/src/var_core/*.py`, every intra-engine import currently reads `from var.<one-of-the-22> import …` or `import var.<one-of-the-22>`; rewrite the leading `var.` to `var_core.` for those 22 module names ONLY. (None of the engine modules import `define_state`, so there is no facade reference to worry about — verify with `grep -rn "from var\b\|import var\b" python/packages/var-core/src` returning nothing after the rewrite; everything should be `var_core.`.)

- [ ] **Step 4: Move the engine unit tests** (all `test_*.py` EXCEPT `test_define_state.py` and `test_conformance.py`):
```bash
cd /Users/aslakhellesoy/git/oselvar/bdd
mkdir -p python/packages/var-core/tests
for t in python/packages/var/tests/test_*.py; do
  b=$(basename "$t")
  case "$b" in test_define_state.py|test_conformance.py) continue;; esac
  git mv "$t" "python/packages/var-core/tests/$b"
done
```
Then rewrite those moved tests' imports `from var.<mod>` → `from var_core.<mod>` (engine modules only; these tests don't import `define_state`).

- [ ] **Step 5: Update the facade + harness to import the engine from `var_core`.**
  - In `python/packages/var/src/var/define_state.py`: its imports of engine pieces (`from var.registry import create_registry, add_step, define_parameter_type`, `from var.step_role import StepKind`, `from var.registry import Registry`) become `from var_core.registry import …` / `from var_core.step_role import …`.
  - In `python/packages/var/tests/test_conformance.py`: `from var.parse import parse`, `from var.conformance import …`, `from var.canonical_json import …` → `from var_core.…`; KEEP `from var.define_state import _reset_builder, build_registry` (still the facade) for now.

- [ ] **Step 6: Verify green.** `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv sync && uv run pytest -q` — ALL pass (engine tests now under `var_core`, facade + conformance still green). `uv run ruff check` clean. Confirm the **48 conformance tests** pass (`uv run pytest -k conformance -q`).

- [ ] **Step 7: Confirm history followed the move.** `git log --follow --oneline -3 -- python/packages/var-core/src/var_core/parse.py` shows pre-move commits.

- [ ] **Step 8: Commit.**
```bash
git add -A && git commit -m "refactor(py): extract var-core engine package from var

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Reshape the `var` facade (internal.py + registry.py subpath)

**Files:**
- Move (git mv): `python/packages/var/src/var/define_state.py` → `python/packages/var/src/var/internal.py`
- Create: `python/packages/var/src/var/registry.py`
- Modify: `python/packages/var/src/var/__init__.py`; importers of `from var.define_state import …` (`var-runner/src/var_runner/steps.py`, `python/packages/var/tests/test_define_state.py`, `python/packages/var/tests/test_conformance.py`)

**Interfaces (Produces):** `var/__init__.py` exports `define_state`; `var.registry` exports `build_registry`, `context_factory`, `_reset_builder` (mirrors TS `@oselvar/var/registry`). `var.internal` holds the implementation.

- [ ] **Step 1: Rename the facade impl module.**
```bash
git mv python/packages/var/src/var/define_state.py python/packages/var/src/var/internal.py
```

- [ ] **Step 2: Add the adapter-glue subpath** `python/packages/var/src/var/registry.py`:
```python
"""Adapter-only glue (mirrors @oselvar/var/registry): build the registry and
context factory from the module-scope accumulator, and reset it between runs."""

from var.internal import _reset_builder, build_registry, context_factory

__all__ = ["build_registry", "context_factory", "_reset_builder"]
```

- [ ] **Step 3: Point `__init__` at `internal`.** `python/packages/var/src/var/__init__.py`:
```python
"""Author facade for var: defineState over the pure var-core engine."""

__version__ = "0.0.0"

from var.internal import define_state

__all__ = ["define_state"]
```

- [ ] **Step 4: Update glue importers** from `from var.define_state import _reset_builder, build_registry, context_factory` → `from var.registry import _reset_builder, build_registry, context_factory`:
  - `python/packages/var-runner/src/var_runner/steps.py`
  - `python/packages/var/tests/test_define_state.py`
  - `python/packages/var/tests/test_conformance.py`
  (grep to confirm none remain: `grep -rn "from var.define_state\|var\.define_state" python/` → nothing.)

- [ ] **Step 5: Verify green.** `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv run pytest -q` ALL pass; conformance green; `uv run ruff check` clean. Confirm `from var import define_state` still works (a conformance bundle's `steps.py` imports it — its bundle test passing proves it).

- [ ] **Step 6: Commit.**
```bash
git add -A && git commit -m "refactor(py): var facade — internal.py + registry.py glue subpath

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Python naming / parameter-order fixes

**Files:**
- Modify: `python/packages/var-runner/src/var_runner/run.py` (`plan_spec` param order), `python/packages/var-runner/src/var_runner/render.py` (`render_failure` param), `python/packages/var-pytest/src/var_pytest/plugin.py` (callers), `python/packages/var-core/src/var_core/conformance.py` (`run_conformance` return type + `to_plan_artifact` param), `python/packages/var/tests/test_conformance.py` (harness consuming the typed return), and the relevant `var-runner`/`var-core` tests.

- [ ] **Step 1: `plan_spec(path, source, registry)`** — flip the parameter order in `var_runner/run.py` (currently `plan_spec(source, path, registry)`), so it matches `parse(path, source)`. Update its caller in `var_pytest/plugin.py` (`VarFile.collect` calls `plan_spec(source, self.path.name, …)` → `plan_spec(self.path.name, source, …)`) and any `var-runner` test calling `plan_spec`. Update the body: it calls `parse(path, source)` — already `(path, source)`, so only the wrapper signature + call sites change.

- [ ] **Step 2: `render_failure(error, source, path)`** — rename the `var_path` parameter to `path` in `var_runner/render.py`, and update the call in `var_pytest/plugin.py` (`render_failure(excinfo.value, self._source, str(self.path))` — positional, so no change needed there) and any `var-runner` render test using the keyword.

- [ ] **Step 3: `run_conformance` returns a typed `BundleArtifacts`.** In `var_core/conformance.py`, define `@dataclass(frozen=True, slots=True) class BundleArtifacts: var_doc: dict; registry: dict; plan: dict; trace: dict` and make `run_conformance(...)` return `BundleArtifacts(var_doc=…, registry=…, plan=…, trace=…)` instead of the `{"varDoc":…, "registry":…, "plan":…, "trace":…}` dict. Update the harness `python/packages/var/tests/test_conformance.py` to read `artifacts.var_doc` / `.registry` / `.plan` / `.trace` and `canonical_stringify` each (the per-artifact wire dicts are unchanged → goldens unchanged). Also rename `to_plan_artifact`'s parameter `execution_plan` → `plan` (alias the `plan` function import as needed, e.g. `from var_core.plan import plan as build_plan` if there is a name clash inside the module — check and resolve).

- [ ] **Step 4: Verify green.** `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv run pytest -q` ALL pass; the **48 conformance tests** still byte-for-byte green (the wire artifacts are unchanged; only the Python return container + param names changed); `uv run ruff check` clean; `uv lock --check` (commit `python/uv.lock` if it drifted).

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "refactor(py): canonical naming — plan_spec(path, source), render_failure path, typed BundleArtifacts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `var-core` conformance unit tests (test-locality parity with TS)

**Why:** TS has TWO conformance tests — `var-core/tests/conformance.test.ts` (unit tests of the projection functions, next to the impl) and `var/tests/conformance.test.ts` (the bundle harness, correctly in the facade because bundle fixtures call `defineState`). Python only has the harness. Add the missing var-core unit tests so both implementations match. The harness STAYS in `var/tests` (it needs the facade) — do not move it.

**Files:**
- Create: `python/packages/var-core/tests/test_conformance.py`
- Reference (port from): `typescript/packages/var-core/tests/conformance.test.ts`

**Interfaces (Consumes):** `var_core.conformance` (`canonical_stringify`, `run_conformance`, `to_var_doc_artifact`, `to_registry_artifact`, `to_plan_artifact`, `to_failure_artifact`, `BundleArtifacts`); `var_core.registry` (`create_registry`, `add_step`); `var_core.parse.parse`, `var_core.plan.plan`; the error types `CellMismatchError` (`var_core.cell_diff`), `DocStringMismatchError` (`var_core.doc_string_diff`), `UnexpectedPassError` (`var_core.execute`).

- [ ] **Step 1: Port the unit tests from TS.** Translate `var-core/tests/conformance.test.ts` to `python/packages/var-core/tests/test_conformance.py`. These exercise the conformance IMPL directly, WITHOUT the facade — build the registry via `create_registry()` + `add_step(...)` (NOT `define_state`/`build_registry`). Cover at minimum (mirroring the TS file):
  - `canonical_stringify` sorts keys recursively + trailing newline; preserves array order.
  - `to_failure_artifact` projects a `CellMismatchError` → `{"kind":"cell-mismatch", "line", "cells":[…]}` (filtering failing cells); a `DocStringMismatchError` → `doc-string-mismatch`; a `ReturnShapeError` → `return-shape`; an `UnexpectedPassError` → `unexpected-pass`; an arbitrary exception → `thrown`.
  - `run_conformance(var_doc, registry, create_context)` over a tiny hand-built example returns a `BundleArtifacts` whose `.var_doc`/`.registry`/`.plan`/`.trace` have the expected shape (read the TS test's assertions and the artifact types in `var_core/conformance.py` for the exact expected fields).
  Use the EXACT current Python signatures (confirm by reading `python/packages/var-core/src/var_core/conformance.py` after Task 3 — `run_conformance` returns `BundleArtifacts`; `to_failure_artifact(error, line)`).

- [ ] **Step 2: Run → all pass.** `cd /Users/aslakhellesoy/git/oselvar/bdd/python && uv run pytest packages/var-core/tests/test_conformance.py -q`. Then full `uv run pytest -q` and `uv run ruff check` green. (The bundle harness in `var/tests/test_conformance.py` is untouched and still green.)

- [ ] **Step 3: Commit.**
```bash
git add -A && git commit -m "test(py): var-core conformance unit tests next to the impl (parity with TS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (against the consistency design):**
- Python splits `var` → `var-core` + `var` → Tasks 1–2. ✓
- `define_state` moves into the facade (`internal.py`); author API `from var import define_state` unchanged → Tasks 1–2. ✓
- Adapter glue on a `var.registry` subpath mirroring TS `@oselvar/var/registry` → Task 2. ✓
- Param order `(path, source)` (`plan_spec`) → Task 3. ✓
- `render_failure(error, source, path)` → Task 3. ✓
- `run_conformance` returns typed `BundleArtifacts`; `to_plan_artifact` param `plan` → Task 3. ✓
- Conformance green byte-for-byte at every task → verified Steps 1.6, 2.5, 3.4. ✓
- No new features ported (hash/drift, snippet, etc. explicitly out) → none added. ✓

**Placeholder scan:** The import-rewrite steps name the exact 22 modules and the exact rewrite rule (`var.<mod>` → `var_core.<mod>`, facade refs excluded) with grep verification — concrete, not "fix imports". No "TBD".

**Type/name consistency:** `var_core` (import package) used consistently; the facade keeps `var`; `internal.py`/`registry.py` names match TS `internal.ts`/`registry.ts`; `plan_spec(path, source, registry)`, `render_failure(error, source, path)`, `BundleArtifacts(var_doc, registry, plan, trace)` are referenced identically across the tasks that define and consume them. The disjoint engine-vs-facade module sets are stated in Global Constraints and used in Tasks 1–2.

**Known risk:** the import rewrite (Task 1 Steps 3/4) is the error-prone part — a blanket `var.`→`var_core.` would wrongly rewrite `from var import define_state`/`from var.define_state`. The steps restrict the rewrite to the 22 engine module names and add grep gates; the 48 conformance tests are the backstop.
