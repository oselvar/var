"""test_collection.py — one TestCase per spec file, one test method per example."""
from __future__ import annotations

import unittest

STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {"n": 0})
@stimulus("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    assert state["n"] == total, f"expected {total} got {state['n']}"
"""

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""

# Steps must be in the same paragraph (single newline, not blank line) so the
# structurer groups them into one example per ## section.
SPEC = "# Calc\n\n## adds two\n\nI add 2\nthe total is 2\n\n## adds wrong\n\nI add 2\nthe total is 9\n"


def _write_calc(harness, spec: str = SPEC) -> None:
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("steps/calc.steps.py", STEPS)
    harness.write("features/calc.md", spec)


def test_one_method_per_example_pass_and_fail(harness):
    _write_calc(harness)
    ns = harness.generate()
    cls = ns["features_calc_md"]
    assert issubclass(cls, unittest.TestCase)
    assert cls.__module__ == "test_var"
    assert sorted(n for n in vars(cls) if n.startswith("test_")) == [
        "test_adds_two",
        "test_adds_wrong",
    ]
    result, output = harness.run(ns)
    assert result.testsRun == 2
    assert len(result.failures) == 1
    assert not result.errors
    # The docstring surfaces the example's real name in verbose output.
    assert "adds two" in output


def test_dotted_id_addresses_a_single_example(harness):
    """python -m unittest test_var.features_calc_md.test_adds_two must work —
    the generated class resolves through the module namespace by name."""
    _write_calc(harness)
    ns = harness.generate()
    test = ns["features_calc_md"]("test_adds_two")
    result = unittest.TestResult()
    test.run(result)
    assert result.testsRun == 1
    assert not result.failures and not result.errors


def test_duplicate_heading_methods_get_unique_names(harness):
    """Two paragraphs under identical ## headings must not collide: the second
    method gets a _1 suffix and its display name the [1] suffix."""
    spec = (
        "# Calc\n\n"
        "## same heading\n\n"
        "I add 2\nthe total is 2\n\n"
        "## same heading\n\n"
        "I add 2\nthe total is 9\n"
    )
    _write_calc(harness, spec)
    ns = harness.generate()
    cls = ns["features_calc_md"]
    assert sorted(n for n in vars(cls) if n.startswith("test_")) == [
        "test_same_heading",
        "test_same_heading_1",
    ]
    assert cls.test_same_heading.__doc__ == "same heading"
    assert cls.test_same_heading_1.__doc__ == "same heading[1]"


def test_non_matching_md_is_ignored(harness):
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("README.md", "# not a spec\n")
    ns = harness.generate()
    assert not [
        v for v in ns.values() if isinstance(v, type) and issubclass(v, unittest.TestCase)
    ]
