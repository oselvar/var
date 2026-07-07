"""test_conformance.py — parametrized var-doc, registry, plan, and trace conformance harness.

For each bundle under conformance/bundles/, parses example.md, projects it
to the var-doc artifact, and asserts byte-for-byte equality with the
committed golden/var-doc.json.

The registry stage imports each bundle's steps.py (after resetting the builder),
builds the registry, projects it, and asserts byte-for-byte equality with
golden/registry.json.

The plan stage builds the execution plan and asserts equality with golden/plan.json.

The trace stage runs all examples via run_conformance and asserts equality with
golden/trace.json for all four artifacts simultaneously.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from var_core.canonical_json import canonical_stringify
from var_core.conformance import run_conformance, to_plan_artifact, to_registry_artifact, to_var_doc_artifact
from var.registry import _custom_parameter_types, _reset_builder, build_registry, context_factory
from var_core.parse import parse
from var_core.plan import plan as build_plan

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


def _find_steps_file(bundle: Path) -> Path | None:
    """Return the canonical step file for *bundle*.

    Prefers ``<name>.steps.py`` (mirroring the TypeScript ``<name>.steps.ts``
    convention) so the stem matches the golden ``stepFile`` values.  Falls back
    to the legacy ``steps.py`` name so existing bundles without a renamed file
    still work.
    """
    candidates = sorted(bundle.glob("*.steps.py"))
    if candidates:
        return candidates[0]
    legacy = bundle / "steps.py"
    return legacy if legacy.exists() else None


def _import_steps(bundle: Path) -> None:
    """Import the step file from *bundle* as a fresh module (unique name each call).

    Using ``spec_from_file_location`` with a unique module name ensures
    ``steps`` sees a different ``co_filename`` per import, and also
    prevents Python's import cache from returning a stale module across bundles.
    """
    steps_py = _find_steps_file(bundle)
    assert steps_py is not None, f"Cannot find a step file in {bundle}"
    module_name = f"_steps_{bundle.name}"
    spec = importlib.util.spec_from_file_location(module_name, steps_py)
    assert spec is not None and spec.loader is not None, f"Cannot load {steps_py}"
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]


# Only parametrize over bundles that have a step file.
BUNDLES_WITH_STEPS = [b for b in BUNDLES if _find_steps_file(b) is not None]


@pytest.mark.parametrize("bundle", BUNDLES_WITH_STEPS, ids=lambda b: b.name)
def test_registry_matches_golden(bundle: Path) -> None:
    _reset_builder()
    _import_steps(bundle)
    registry = build_registry()
    artifact = to_registry_artifact(registry, _custom_parameter_types())
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


@pytest.mark.parametrize("bundle", BUNDLES_WITH_STEPS, ids=lambda b: b.name)
def test_trace_matches_golden(bundle: Path) -> None:
    _reset_builder()
    _import_steps(bundle)
    registry = build_registry()
    create_ctx = context_factory()
    source = (bundle / "example.md").read_text(encoding="utf-8")
    doc = parse("example.md", source)
    artifacts = run_conformance(doc, registry, create_ctx, tuple(_custom_parameter_types()))
    actual = canonical_stringify(artifacts.trace)
    expected = (bundle / "golden" / "trace.json").read_text(encoding="utf-8")
    assert actual == expected, f"trace.json mismatch for {bundle.name}"
