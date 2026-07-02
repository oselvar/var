from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from var_config import read_var_config
from var_runner.discovery import match_spec
from var_runner.run import RecordingReporter, examples_with_runs, plan_spec
from var_runner.steps import load_steps
from var_pytest.fixtures import _active_request, get_active_request, wrap_registry_for_fixtures

_STASH: dict = {}  # keyed by config id → (VarConfig, LoadedSteps, root)


def pytest_configure(config: pytest.Config) -> None:
    root = Path(config.rootpath)
    cfg = read_var_config(root)
    loaded = load_steps(cfg.steps, root)
    wrapped_registry = wrap_registry_for_fixtures(loaded.registry, get_active_request)
    loaded = dataclasses.replace(loaded, registry=wrapped_registry)
    _STASH[id(config)] = (cfg, loaded, root)


def pytest_unconfigure(config: pytest.Config) -> None:
    _STASH.pop(id(config), None)


def pytest_collect_file(file_path: Path, parent: pytest.Collector):
    if file_path.suffix != ".md":
        return None
    cfg, _loaded, root = _STASH[id(parent.config)]
    if not match_spec(file_path, cfg.docs_include, cfg.docs_exclude, root):
        return None
    return VarFile.from_parent(parent, path=file_path)


class VarFile(pytest.File):
    def collect(self):
        _cfg, loaded, _root = _STASH[id(self.config)]
        source = self.path.read_text(encoding="utf-8")
        execution_plan = plan_spec(self.path.name, source, loaded.registry)
        pairs = examples_with_runs(execution_plan, loaded.create_context, RecordingReporter())
        seen: dict[str, int] = {}
        for example, run in pairs:
            # Use the innermost heading (scope_stack[-1]) as the item name so
            # pytest displays "## adds two" as "adds two"; fall back to the
            # body-derived name when there is no scope.
            base = example.scope_stack[-1] if example.scope_stack else example.name
            idx = seen.get(base, 0)
            seen[base] = idx + 1
            name = base if idx == 0 else f"{base}[{idx}]"
            yield VarItem.from_parent(self, name=name, example=example, run=run, source=source)


class VarItem(pytest.Item):
    def __init__(self, *, example, run, source, **kw):
        super().__init__(**kw)
        self._example = example
        self._run = run
        self._source = source
        self._token = None

    def setup(self) -> None:
        from _pytest.fixtures import TopRequest

        fm = self.session._fixturemanager
        self._fixtureinfo = fm.getfixtureinfo(node=self, func=None, cls=None)
        self.fixturenames = self._fixtureinfo.names_closure
        self.funcargs: dict = {}
        self._request = TopRequest(self, _ispytest=True)  # type: ignore[arg-type]
        self._token = _active_request.set(self._request)

    def runtest(self) -> None:
        self._run()

    def teardown(self) -> None:
        if self._token is not None:
            _active_request.reset(self._token)
            self._token = None

    def repr_failure(self, excinfo: object) -> str:
        from var_runner.render import render_failure

        return render_failure(excinfo.value, self._source, str(self.path))  # type: ignore[union-attr]

    def reportinfo(self):
        return self.path, self._example.span.start_line - 1, self.name
