"""test_conformance.py — parametrized var-doc and registry conformance harness.

For each bundle under conformance/bundles/, parses example.md, projects it
to the var-doc artifact, and asserts byte-for-byte equality with the
committed golden/var-doc.json.

The registry stage imports each bundle's steps.py (after resetting the builder),
builds the registry, projects it, and asserts byte-for-byte equality with
golden/registry.json.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from var.canonical_json import canonical_stringify
from var.conformance import to_plan_artifact, to_registry_artifact, to_var_doc_artifact
from var.define_state import _reset_builder, build_registry
from var.parse import parse
from var.plan import plan as build_plan

# python/packages/var/tests/ -> parents[4] = repo root
BUNDLES_DIR = Path(__file__).resolve().parents[4] / "conformance" / "bundles"
BUNDLES = sorted(p for p in BUNDLES_DIR.iterdir() if p.is_dir())


@pytest.mark.parametrize("bundle", BUNDLES, ids=lambda b: b.name)
def test_var_doc_matches_golden(bundle: Path) -> None:
    source = (bundle / "example.md").read_text(encoding="utf-8")
    doc = parse("example.md", source)
    artifact = to_var_doc_artifact(doc)
    actual = canonical_stringify(artifact)
    expected = (bundle / "golden" / "var-doc.json").read_text(encoding="utf-8")
    assert actual == expected


def _import_steps(bundle: Path) -> None:
    """Import steps.py from *bundle* as a fresh module (unique name each call).

    Using ``spec_from_file_location`` with a unique module name ensures
    ``define_state`` sees a different ``co_filename`` per import, and also
    prevents Python's import cache from returning a stale module across bundles.
    """
    steps_py = bundle / "steps.py"
    module_name = f"_steps_{bundle.name}"
    spec = importlib.util.spec_from_file_location(module_name, steps_py)
    assert spec is not None and spec.loader is not None, f"Cannot find {steps_py}"
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]


# Only parametrize over bundles that have a steps.py
BUNDLES_WITH_STEPS = [b for b in BUNDLES if (b / "steps.py").exists()]


@pytest.mark.parametrize("bundle", BUNDLES_WITH_STEPS, ids=lambda b: b.name)
def test_registry_matches_golden(bundle: Path) -> None:
    _reset_builder()
    _import_steps(bundle)
    registry = build_registry()
    artifact = to_registry_artifact(registry)
    actual = canonical_stringify(artifact)
    expected = (bundle / "golden" / "registry.json").read_text(encoding="utf-8")
    assert actual == expected, f"registry.json mismatch for {bundle.name}"


@pytest.mark.parametrize("bundle", BUNDLES_WITH_STEPS, ids=lambda b: b.name)
def test_plan_matches_golden(bundle: Path) -> None:
    _reset_builder()
    _import_steps(bundle)
    registry = build_registry()
    source = (bundle / "example.md").read_text(encoding="utf-8")
    doc = parse("example.md", source)
    execution = build_plan(doc, registry)
    artifact = to_plan_artifact(execution)
    actual = canonical_stringify(artifact)
    expected = (bundle / "golden" / "plan.json").read_text(encoding="utf-8")
    assert actual == expected, f"plan.json mismatch for {bundle.name}"
