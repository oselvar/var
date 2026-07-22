"""test_conformance.py — unit tests for varar_core.conformance projections.

Port of typescript/packages/core/tests/conformance.test.ts.
Exercises the projection functions and run_conformance directly using
create_registry()+add_step() — no facade dependency.
"""
from __future__ import annotations

from varar_core.canonical_json import canonical_stringify
from varar_core.cell_diff import CellDiff, CellMismatchError, ReturnShapeError
from varar_core.conformance import (
    run_conformance,
    to_failure_artifact,
    to_plan_artifact,
    to_registry_artifact,
    to_var_doc_artifact,
)
from varar_core.doc_string_diff import compare_doc_string
from varar_core.execute import UnexpectedPassError
from varar_core.parse import parse
from varar_core.plan import plan
from varar_core.registry import add_step, create_registry, define_parameter_type
from varar_core.span import Span


# ---------------------------------------------------------------------------
# canonical_stringify
# ---------------------------------------------------------------------------


def test_canonical_stringify_sorts_keys_recursively_and_ends_with_newline():
    out = canonical_stringify({"b": 1, "a": {"d": 2, "c": 3}})
    assert out == '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n'


def test_canonical_stringify_preserves_array_order():
    assert canonical_stringify([3, 1, 2]) == "[\n  3,\n  1,\n  2\n]\n"


# ---------------------------------------------------------------------------
# to_failure_artifact — shared span fixture
# ---------------------------------------------------------------------------

_SPAN = Span(start_offset=0, end_offset=1, start_line=7, start_col=1, end_line=7, end_col=2)
_SPAN_DICT = {
    "startOffset": 0,
    "endOffset": 1,
    "startLine": 7,
    "startCol": 1,
    "endLine": 7,
    "endCol": 2,
}
_CELL_SPAN = Span(start_offset=30, end_offset=33, start_line=9, start_col=3, end_line=9, end_col=6)
_CELL_SPAN_DICT = {
    "startOffset": 30,
    "endOffset": 33,
    "startLine": 9,
    "startCol": 3,
    "endLine": 9,
    "endCol": 6,
}


def test_to_failure_artifact_projects_cell_mismatch_error_anchored_at_first_failing_cell():
    err = CellMismatchError([
        CellDiff(column="score", span=_CELL_SPAN, expected="9", actual="6", ok=False),
    ])
    assert to_failure_artifact(err, _SPAN) == {
        "kind": "cell-mismatch",
        "line": 7,
        "anchor": _CELL_SPAN_DICT,
        "message": "score: expected 9 but was 6",
        "cells": [{"column": "score", "expected": "9", "actual": "6", "span": _CELL_SPAN_DICT}],
    }


def test_to_failure_artifact_projects_a_doc_string_cell_as_a_cell_mismatch():
    diff = compare_doc_string("b", "a", _CELL_SPAN)
    assert diff is not None
    assert to_failure_artifact(CellMismatchError([diff]), _SPAN) == {
        "kind": "cell-mismatch",
        "line": 7,
        "anchor": _CELL_SPAN_DICT,
        "message": 'doc string: expected "a" but was "b"',
        "cells": [
            {
                "column": "doc string",
                "expected": '"a"',
                "actual": '"b"',
                "span": _CELL_SPAN_DICT,
            }
        ],
    }



def test_to_failure_artifact_maps_unexpected_pass_and_opaque_throws():
    assert to_failure_artifact(UnexpectedPassError(), _SPAN)["kind"] == "unexpected-pass"
    assert to_failure_artifact(Exception("boom"), _SPAN) == {
        "kind": "thrown",
        "line": 7,
        "anchor": _SPAN_DICT,
    }


def test_to_failure_artifact_takes_line_and_anchor_from_match_span_never_the_stack():
    # No stack scraping: both are source positions derived from the span the
    # caller passes, so every language port reproduces them.
    err = Exception("boom")
    assert to_failure_artifact(err, _SPAN) == {
        "kind": "thrown",
        "line": 7,
        "anchor": _SPAN_DICT,
    }


def test_to_failure_artifact_maps_return_shape_error():
    err = ReturnShapeError("wrong shape")
    assert to_failure_artifact(err, _SPAN) == {
        "kind": "return-shape",
        "line": 7,
        "anchor": _SPAN_DICT,
        "message": "wrong shape",
    }


# ---------------------------------------------------------------------------
# to_registry_artifact
# ---------------------------------------------------------------------------


def test_to_registry_artifact_lists_expressions_and_parameter_type_names():
    r = add_step(
        create_registry(),
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    assert to_registry_artifact(r) == {
        "steps": [{"expression": "I have {int} cukes", "parameterTypeNames": ["int"]}],
        "parameterTypes": [],
    }


def test_to_registry_artifact_reads_parameter_names_ignoring_escaped_braces():
    # A naive {…} regex would wrongly count \{a, b\} as a parameter and yield
    # ['a, b', 'int']; the AST sees only the real {int}.
    r = add_step(
        create_registry(),
        expression=r"the set \{a, b\} has {int} elements",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    assert to_registry_artifact(r)["steps"][0]["parameterTypeNames"] == ["int"]


def test_to_registry_artifact_projects_passed_custom_parameter_types() -> None:
    r = create_registry()
    r = define_parameter_type(r, name="airport", regexp="[A-Z]{3}")
    r = add_step(
        r,
        expression="I fly to {airport}",
        expression_source_file="airports.steps",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    assert to_registry_artifact(r, [{"name": "airport", "regexp": "[A-Z]{3}"}]) == {
        "steps": [{"expression": "I fly to {airport}", "parameterTypeNames": ["airport"]}],
        "parameterTypes": [{"name": "airport", "regexp": "[A-Z]{3}"}],
    }


# ---------------------------------------------------------------------------
# to_plan_artifact
# ---------------------------------------------------------------------------


def test_to_plan_artifact_projects_examples_expected_outcome_and_args():
    r = add_step(
        create_registry(),
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    art = to_plan_artifact(plan(parse("e.md", "# A\n\nI have 5 cukes."), r))
    assert art["examples"][0]["expectedOutcome"] == "pass"
    assert art["examples"][0]["steps"][0]["matchedExpression"] == "I have {int} cukes"
    assert art["examples"][0]["steps"][0]["args"] == [{"value": "5", "parameterType": "int"}]


def test_to_plan_artifact_projects_diagnostics_without_message_or_path():
    import json

    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="/abs/s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    r = add_step(
        r,
        expression="I have 5 cukes",
        expression_source_file="/abs/s.ts",
        expression_source_line=2,
        kind="stimulus",
        handler=lambda *_: None,
    )
    art = to_plan_artifact(plan(parse("e.md", "# A\n\nI have 5 cukes."), r))
    assert len(art["diagnostics"]) == 1
    assert "message" not in art["diagnostics"][0]
    assert art["diagnostics"][0]["code"] == "ambiguous-match"
    assert "/abs/" not in json.dumps(art["diagnostics"][0])


# ---------------------------------------------------------------------------
# to_var_doc_artifact
# ---------------------------------------------------------------------------


def test_to_var_doc_artifact_keeps_path_examples_and_orphan_attachments():
    art = to_var_doc_artifact(parse("e.md", "# A\n\nI have 5 cukes."))
    assert art["path"] == "e.md"
    assert isinstance(art["examples"], list)


# ---------------------------------------------------------------------------
# run_conformance
# ---------------------------------------------------------------------------


def test_run_conformance_passing_example_yields_pass_steps_with_structural_context_key():
    r = add_step(
        create_registry(),
        expression="I have {int} cukes",
        expression_source_file="/abs/s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    out = run_conformance(parse("e.md", "# A\n\nI have 5 cukes."), r, lambda _name: {})
    assert out.trace["examples"][0] == {
        "name": "I have 5 cukes",
        "outcome": "pass",
        "steps": [
            {
                "exampleName": "I have 5 cukes",
                "ordinal": 1,
                "stepText": "I have 5 cukes",
                "matchedExpression": "I have {int} cukes",
                "contextKey": {"exampleName": "I have 5 cukes", "stepFile": "s"},
                "outcome": "pass",
            }
        ],
    }


def test_run_conformance_expected_failure_example_reads_pass_but_step_carries_failure():
    def _divide(_ctx, a, b):
        if b == 0:
            raise Exception("division by zero")

    r = add_step(
        create_registry(),
        expression="I divide {int} by {int}",
        expression_source_file="/abs/s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=_divide,
    )
    src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n"
    out = run_conformance(parse("e.md", src), r, lambda _name: {})
    ex = out.trace["examples"][0]
    assert ex["outcome"] == "pass"
    assert ex["steps"][0]["outcome"] == "fail"
    assert ex["steps"][0]["failure"]["kind"] == "thrown"
