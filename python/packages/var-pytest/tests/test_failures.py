"""test_failures.py — pytester-based tests for VarItem.repr_failure.

Tests:
- Cell-mismatch failure renders line number + expected/actual diff.
- A paragraph whose sentences match no step definition is silently ignored.
"""

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""

# ---------------------------------------------------------------------------
# Cell-mismatch fixtures (mirrors conformance bundle 07-row-check-mismatch)
# ---------------------------------------------------------------------------

CELL_MISMATCH_SPEC = """\
# Scoring

## A wrong score is caught

I report the score and grade.

| score | grade |
| ----- | ----- |
| 10    | A     |
"""

CELL_MISMATCH_STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {})

@sensor("I report the score and grade")
def _(state, row=None):
    return {"score": "99", "grade": "A"}
"""

# ---------------------------------------------------------------------------
# Prose-paragraph fixtures (no matching step defs → silently ignored)
# ---------------------------------------------------------------------------

# A spec with one real example AND one prose paragraph that matches no step def.
PROSE_AND_REAL_SPEC = """\
# My Feature

## Prose paragraph

This sentence matches no step definition at all.

## A real example

I report the score and grade.

| score | grade |
| ----- | ----- |
| 99    | A     |
"""

# A spec with ONLY a prose paragraph — the whole file has no matched steps.
PROSE_ONLY_SPEC = """\
# My Feature

## Prose paragraph

This sentence matches no step definition at all.
"""

PROSE_STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {})

@sensor("I report the score and grade")
def _(state, row=None):
    return {"score": "99", "grade": "A"}
"""

# Steps that register NO defs at all.
EMPTY_STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {})
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_fixture(pytester, spec_content: str, steps_content: str) -> None:
    (pytester.path / "var.config.json").write_text(VAR_CONFIG, encoding="utf-8")
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps" / "spec.steps.py").write_text(
        steps_content.strip(), encoding="utf-8"
    )
    (pytester.path / "features").mkdir(exist_ok=True)
    (pytester.path / "features" / "spec.md").write_text(spec_content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_cell_mismatch_repr_failure_shows_line_and_diff(pytester):
    """repr_failure for CellMismatchError must include the markdown line number,
    the column name, and the expected/actual values."""
    _write_fixture(pytester, CELL_MISMATCH_SPEC, CELL_MISMATCH_STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(failed=1)
    # render_failure output: "line N | column 'score' — expected: '10', actual: '99'"
    result.stdout.fnmatch_lines(["*score*"])
    result.stdout.fnmatch_lines(["*expected*10*"])
    result.stdout.fnmatch_lines(["*actual*99*"])
    # A line-number reference must appear somewhere in the output.
    assert any("line" in line for line in result.stdout.lines)


def test_prose_paragraph_with_no_matching_steps_is_silently_ignored(pytester):
    """A paragraph whose sentences match no step definition must NOT be collected
    as a test item — it is plain prose and is silently dropped by the planner."""
    _write_fixture(pytester, PROSE_ONLY_SPEC, EMPTY_STEPS)
    result = pytester.runpytest("-v")
    # No items collected, no failures.
    result.assert_outcomes(passed=0, failed=0)


def test_prose_paragraph_does_not_pollute_real_examples(pytester):
    """A spec that mixes a prose paragraph (no matches) with a real example must
    collect only the real example — no extra failing item for the prose."""
    _write_fixture(pytester, PROSE_AND_REAL_SPEC, PROSE_STEPS)
    result = pytester.runpytest("-v")
    # Only the one real example should be collected and should pass.
    result.assert_outcomes(passed=1, failed=0)
