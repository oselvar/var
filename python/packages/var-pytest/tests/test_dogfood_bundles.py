"""test_dogfood_bundles.py — integration tests running real conformance bundles.

Each test copies a bundle's example.md and <name>.steps.py into the pytester
tree, runs pytest with a [tool.var] config pointing at them, and asserts the
outcome matches the bundle's intent as documented by its golden trace.json.

Bundles exercised:
- 01-roman-numerals  : happy-path example → PASSED
- 03-expected-failure: example declared expected_outcome=fail, step throws the
                       expected error → the core inverts the outcome (run() does
                       NOT raise) → pytest reports PASSED
- 07-row-check-mismatch: sensor returns wrong cell value → FAILED with a
                         markdown-anchored cell-mismatch message

Bundles directory is resolved robustly relative to this file:
  python/packages/var-pytest/tests/  →  parents[4]  →  repo root
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Bundle directory
# ---------------------------------------------------------------------------

_BUNDLES = Path(__file__).resolve().parents[4] / "conformance" / "bundles"
assert _BUNDLES.is_dir(), f"bundles dir not found: {_BUNDLES}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup_bundle(pytester, bundle_name: str, steps_filename: str) -> None:
    """Copy bundle's example.md and steps file into the pytester tree."""
    bundle_dir = _BUNDLES / bundle_name
    example_md = (bundle_dir / "example.md").read_text(encoding="utf-8")
    steps_py = (bundle_dir / steps_filename).read_text(encoding="utf-8")

    pytester.makepyprojecttoml(
        """
[tool.var]
vars = ["specs/**/*.md"]
steps = ["steps/**/*.steps.py"]
"""
    )
    (pytester.path / "specs").mkdir()
    (pytester.path / "specs" / "example.md").write_text(example_md, encoding="utf-8")
    (pytester.path / "steps").mkdir()
    (pytester.path / "steps" / steps_filename).write_text(steps_py, encoding="utf-8")


# ---------------------------------------------------------------------------
# 01 — happy-path example passes
# ---------------------------------------------------------------------------


def test_bundle_01_roman_numerals_passes(pytester):
    """Happy-path bundle: the single example must be reported PASSED."""
    _setup_bundle(pytester, "01-roman-numerals", "numerals.steps.py")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
    result.stdout.fnmatch_lines(["*Converting 1*PASSED*"])


# ---------------------------------------------------------------------------
# 03 — expected-failure: satisfied → PASSED
# ---------------------------------------------------------------------------


def test_bundle_03_expected_failure_reports_passed(pytester):
    """Expected-failure bundle: the step throws the expected error.

    The core inverts the outcome — run() does NOT raise — so pytest reports
    the example as PASSED (the expected failure occurred as intended).
    """
    _setup_bundle(pytester, "03-expected-failure", "division.steps.py")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
    result.stdout.fnmatch_lines(["*Dividing by zero is rejected*PASSED*"])


# ---------------------------------------------------------------------------
# 07 — row-check mismatch: FAILED with markdown-anchored cell diff
# ---------------------------------------------------------------------------


def test_bundle_07_row_check_mismatch_fails_with_cell_diff(pytester):
    """Cell-mismatch bundle: the sensor returns a wrong score.

    The example must be reported FAILED, and the failure output must reference
    the mismatched column and its expected/actual values.
    """
    _setup_bundle(pytester, "07-row-check-mismatch", "report.steps.py")
    result = pytester.runpytest("-v")
    result.assert_outcomes(failed=1)
    # Header-bound row examples use the step text as their item name
    # (scope_stack[-1] == "I report the score and grade"), not the ## heading.
    result.stdout.fnmatch_lines(["*I report the score and grade*FAILED*"])
    # The repr_failure output must include the column name and both values.
    result.stdout.fnmatch_lines(["*score*"])
    result.stdout.fnmatch_lines(["*expected*10*"])
    result.stdout.fnmatch_lines(["*actual*99*"])
    # The render_failure output emits "line N | column ..." — assert the exact line.
    result.stdout.fnmatch_lines(["*line 9*"])
