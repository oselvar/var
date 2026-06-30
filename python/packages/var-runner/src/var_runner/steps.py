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
