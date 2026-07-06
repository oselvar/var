"""test_dogfood_bundles.py — integration tests running real conformance bundles.

Each test copies a bundle's example.md and <name>.steps.py into the harness
tree, generates + runs the unittest cases, and asserts the outcome matches
the bundle's intent as documented by its golden trace.json.

Bundles exercised (same set as var-pytest's dogfood tests):
- 01-roman-numerals  : happy-path example → passes
- 03-expected-failure: expected_outcome=fail satisfied → the core inverts the
                       outcome, so unittest reports a pass
- 07-row-check-mismatch: sensor returns a wrong cell value → unittest failure
                         with a markdown-anchored cell-mismatch message
"""
from __future__ import annotations

from pathlib import Path

_BUNDLES = Path(__file__).resolve().parents[4] / "conformance" / "bundles"
assert _BUNDLES.is_dir(), f"bundles dir not found: {_BUNDLES}"

VAR_CONFIG = """\
{"docs": {"include": ["specs/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""


def _setup_bundle(harness, bundle_name: str, steps_filename: str) -> None:
    bundle_dir = _BUNDLES / bundle_name
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("specs/example.md", (bundle_dir / "example.md").read_text(encoding="utf-8"))
    harness.write(
        f"steps/{steps_filename}", (bundle_dir / steps_filename).read_text(encoding="utf-8")
    )


def test_bundle_01_roman_numerals_passes(harness):
    _setup_bundle(harness, "01-roman-numerals", "numerals.steps.py")
    result, output = harness.generate_and_run()
    assert result.testsRun == 1
    assert not result.failures and not result.errors
    assert "Converting 1" in output


def test_bundle_03_expected_failure_reports_passed(harness):
    """The step throws the expected error; the core inverts the outcome, so
    run() does not raise and unittest reports the example as passing."""
    _setup_bundle(harness, "03-expected-failure", "division.steps.py")
    result, _output = harness.generate_and_run()
    assert result.testsRun == 1
    assert not result.failures and not result.errors


def test_bundle_07_row_check_mismatch_fails_with_cell_diff(harness):
    _setup_bundle(harness, "07-row-check-mismatch", "report.steps.py")
    result, _output = harness.generate_and_run()
    assert result.testsRun == 1
    assert len(result.failures) == 1
    (_test, message) = result.failures[0]
    assert "score" in message
    assert "'10'" in message
    assert "'99'" in message
    assert "line 9" in message
