"""unittest adapter for var.

One call in a test module turns every spec matched by varar.config.json into
generated ``unittest.TestCase`` classes — one class per spec file, one test
method per example::

    # test_var.py
    from varar_unittest import generate_tests

    generate_tests(globals())

Plain ``python -m unittest`` (or any unittest-compatible runner) then
discovers and runs them like hand-written tests: ``-v`` shows one line per
example, ``-k`` selects by name, and dotted ids
(``test_var.hello_var_md.test_greeting``) address a single example.
"""
from __future__ import annotations

import os
import re
import unittest
from pathlib import Path
from typing import Any, Callable

from varar_config import read_varar_config
from varar_core.cell_diff import ReturnShapeError, is_cell_mismatch_error
from varar_core.diagnostics import drift_detected
from varar_core.drift import reconcile_drift
from varar_core.execute import is_unexpected_pass_error
from varar_runner.baseline_store import create_file_baseline_store
from varar_runner.discovery import find_specs
from varar_runner.render import render_failure
from varar_runner.run import RecordingReporter, examples_with_runs, plan_spec
from varar_runner.steps import LoadedSteps, load_steps

__version__ = "0.0.0"


def generate_tests(namespace: dict[str, Any], root: str | Path | None = None) -> None:
    """Generate unittest test cases for every spec into *namespace*.

    Reads ``varar.config.json`` from *root* (default: the directory of the
    module *namespace* belongs to, via its ``__file__``), loads the step
    definition files it globs, and assigns one ``unittest.TestCase`` subclass
    per matched spec file into *namespace* — one ``test_*`` method per
    example.
    """
    if root is None:
        root = Path(namespace["__file__"]).parent
    root = Path(os.path.abspath(root))
    cfg = read_varar_config(root)
    loaded = load_steps(cfg.steps, root)
    store = create_file_baseline_store(root)
    module_name = namespace.get("__name__")
    for spec_path in find_specs(cfg.docs_include, cfg.docs_exclude, root):
        cls = _spec_test_case(spec_path, root, loaded, module_name, store)
        namespace[cls.__name__] = cls


def _spec_test_case(
    spec_path: Path,
    root: Path,
    loaded: LoadedSteps,
    module_name: str | None,
    store: Any,
) -> type[unittest.TestCase]:
    """Build one TestCase subclass for *spec_path*, one method per example."""
    # walk_up: a spec outside the config root (matched via a ../ glob) still
    # gets a stable relative label.
    rel = Path(os.path.abspath(spec_path)).relative_to(root, walk_up=True).as_posix()
    source = spec_path.read_text(encoding="utf-8")
    execution_plan = plan_spec(spec_path.name, source, loaded.registry)
    pairs = examples_with_runs(execution_plan, loaded.create_context, RecordingReporter())

    methods: dict[str, Any] = {"__doc__": rel}
    seen: dict[str, int] = {}
    for example, run in pairs:
        # Innermost heading as the display name, same rule as var-pytest;
        # method names are the identifier-safe projection of it.
        base = example.scope_stack[-1] if example.scope_stack else example.name
        stem = _identifier(base)
        idx = seen.get(stem, 0)
        seen[stem] = idx + 1
        display = base if idx == 0 else f"{base}[{idx}]"
        method_name = f"test_{stem}" if idx == 0 else f"test_{stem}_{idx}"
        methods[method_name] = _make_test_method(run, display, source, rel)

    # Reconcile drift: a clean run records/updates the baseline; a paragraph
    # that was an example and no longer matches becomes a failing test method
    # (VARAR_UPDATE=1 accepts and re-records instead).
    update = os.environ.get("VARAR_UPDATE") in ("1", "true")
    drifts = reconcile_drift(
        store, rel, source, execution_plan.var_doc, execution_plan, update=update
    )
    for d in drifts:
        methods[f"test_var_drift_{d.line}"] = _make_drift_method(
            drift_detected(d.name, d.span).message
        )

    cls = type(_identifier(rel), (unittest.TestCase,), methods)
    if module_name is not None:
        cls.__module__ = module_name
    return cls


def _make_test_method(
    run: Callable[[], None],
    display: str,
    source: str,
    rel_path: str,
) -> Callable[[Any], None]:
    def test(self: unittest.TestCase) -> None:
        try:
            run()
        except Exception as err:
            if _is_var_diff_error(err):
                # A markdown/return mismatch is a test *failure* (not an
                # error): re-raise as failureException with the rendered,
                # span-anchored message. Other exceptions propagate as
                # errors with their traceback (including the "at <step>
                # (<path>:<line>:<col>)" note the core attaches).
                raise self.failureException(render_failure(err, source, rel_path)) from err
            raise

    # First docstring line is unittest's shortDescription — verbose output
    # shows the example's real (unsanitized) name next to the method id.
    test.__doc__ = display
    return test


def _make_drift_method(message: str) -> Callable[[Any], None]:
    def test(self: unittest.TestCase) -> None:
        raise self.failureException(message)

    test.__doc__ = "var drift — accept with VARAR_UPDATE=1"
    return test


def _is_var_diff_error(err: BaseException) -> bool:
    return (
        is_cell_mismatch_error(err)
        or isinstance(err, ReturnShapeError)
        or is_unexpected_pass_error(err)
    )


def _identifier(text: str) -> str:
    """Project arbitrary text onto a valid Python identifier."""
    ident = re.sub(r"\W+", "_", text).strip("_")
    if not ident:
        ident = "example"
    if ident[0].isdigit():
        ident = f"_{ident}"
    return ident
