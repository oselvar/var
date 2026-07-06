"""test_failures.py — failure vs error classification and rendered messages.

- A markdown/return mismatch (CellMismatchError & co) is a unittest *failure*
  whose message is the span-anchored render_failure output.
- A step raising an ordinary exception is a unittest *error*.
- Prose paragraphs matching no step definition are silently ignored.
"""
from __future__ import annotations

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""

# Mirrors conformance bundle 07-row-check-mismatch.
CELL_MISMATCH_SPEC = """\
# Scoring

## A wrong score is caught

I report the score and grade.

| score | grade |
| ----- | ----- |
| 10    | A     |
"""

CELL_MISMATCH_STEPS = """\
from var import define_state
stimulus, sensor = define_state(lambda: {})

@sensor("I report the score and grade")
def _(state, row=None):
    return {"score": "99", "grade": "A"}
"""

PROSE_ONLY_SPEC = """\
# My Feature

## Prose paragraph

This sentence matches no step definition at all.
"""

EMPTY_STEPS = """\
from var import define_state
stimulus, sensor = define_state(lambda: {})
"""

RAISING_SPEC = """\
# Boom

## the step blows up

I explode
"""

RAISING_STEPS = """\
from var import define_state
stimulus, sensor = define_state(lambda: {})

@stimulus("I explode")
def _(state):
    raise ValueError("kaboom")
"""


def test_cell_mismatch_is_a_failure_with_rendered_diff(harness):
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("steps/spec.steps.py", CELL_MISMATCH_STEPS)
    harness.write("features/spec.md", CELL_MISMATCH_SPEC)
    result, _output = harness.generate_and_run()
    assert result.testsRun == 1
    assert len(result.failures) == 1
    assert not result.errors
    (_test, message) = result.failures[0]
    # render_failure output: "line N | column 'score' — expected: '10', actual: '99'"
    assert "score" in message
    assert "'10'" in message
    assert "'99'" in message
    assert "line" in message


def test_step_exception_is_an_error_not_a_failure(harness):
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("steps/spec.steps.py", RAISING_STEPS)
    harness.write("features/spec.md", RAISING_SPEC)
    result, _output = harness.generate_and_run()
    assert result.testsRun == 1
    assert not result.failures
    assert len(result.errors) == 1
    (_test, message) = result.errors[0]
    assert "kaboom" in message
    # The core's add_note anchor points at the failing step in the .md.
    assert "spec.md" in message


def test_prose_paragraph_with_no_matching_steps_is_silently_ignored(harness):
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("steps/spec.steps.py", EMPTY_STEPS)
    harness.write("features/spec.md", PROSE_ONLY_SPEC)
    result, _output = harness.generate_and_run()
    assert result.testsRun == 0
