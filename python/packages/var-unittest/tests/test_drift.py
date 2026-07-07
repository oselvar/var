"""Drift gate through the unittest adapter."""
from __future__ import annotations

import json

STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {"n": 0})
@stimulus("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
"""

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""


def _project(harness, spec_rel: str, spec: str) -> None:
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("steps/calc.steps.py", STEPS)
    harness.write(spec_rel, spec)


def _baseline(harness, spec_key: str, examples) -> None:
    lock = {"version": 1, "specs": {spec_key: {"sourceHash": "fnv1a:0", "examples": examples}}}
    harness.write("var.lock.json", json.dumps(lock))


def _lock(harness):
    return json.loads((harness.root / "var.lock.json").read_text(encoding="utf-8"))


def test_first_run_records_the_baseline(harness):
    _project(harness, "features/calc.md", "I add 2\n")
    result, _ = harness.generate_and_run()
    assert result.wasSuccessful()
    assert _lock(harness)["specs"]["features/calc.md"]["examples"] == [
        {"name": "I add 2", "line": 1}
    ]


def test_a_paragraph_that_stopped_matching_drifts_and_fails(harness):
    _project(harness, "features/vault.md", "The vault is sealed.\n")
    _baseline(harness, "features/vault.md", [{"name": "The vault is sealed", "line": 1}])
    before = (harness.root / "var.lock.json").read_text(encoding="utf-8")
    result, output = harness.generate_and_run()
    assert not result.wasSuccessful()
    assert "The vault is sealed" in output
    # Unacknowledged drift leaves the baseline untouched.
    assert (harness.root / "var.lock.json").read_text(encoding="utf-8") == before


def test_var_update_accepts_drift(harness, monkeypatch):
    monkeypatch.setenv("VAR_UPDATE", "1")
    _project(harness, "features/vault.md", "The vault is sealed.\n")
    _baseline(harness, "features/vault.md", [{"name": "The vault is sealed", "line": 1}])
    result, _ = harness.generate_and_run()
    assert result.wasSuccessful()
    assert _lock(harness)["specs"]["features/vault.md"]["examples"] == []
