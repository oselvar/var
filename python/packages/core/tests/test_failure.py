"""test_failure.py — port of typescript/packages/core/tests/failure.test.ts"""
from __future__ import annotations

from varar_core.cell_diff import CellDiff, CellMismatchError, ReturnShapeError
from varar_core.doc_string_diff import compare_doc_string
from varar_core.failure import to_failure
from varar_core.result import CellFailure
from varar_core.span import span_from_offsets


def test_to_failure_extracts_cells_from_cell_mismatch_error() -> None:
    source = "a | 5 |"
    err = CellMismatchError(
        [CellDiff(column="n", span=span_from_offsets(source, 4, 5), expected="5", actual="4", ok=False)]
    )
    f = to_failure(err, "spec.md", 3)
    assert f.cells == (CellFailure(from_=4, to=5, actual="4"),)
    assert isinstance(f.message, str)
    assert isinstance(f.stack, str)


def test_to_failure_extracts_a_doc_string_mismatch_as_a_cell() -> None:
    source = "Hello!\n"
    diff = compare_doc_string("Goodbye!\n", "Hello!\n", span_from_offsets(source, 0, 7))
    assert diff is not None
    f = to_failure(CellMismatchError([diff]), "spec.md", 3)
    assert f.cells is not None
    assert [(c.from_, c.to, c.actual) for c in f.cells] == [(0, 7, '"Goodbye!\\n"')]



def test_to_failure_leaves_cells_undefined_for_plain_error_or_return_shape_error() -> None:
    assert to_failure(Exception("nope"), "spec.md", 3).cells is None
    assert to_failure(ReturnShapeError("bad"), "spec.md", 3).cells is None


def test_to_failure_reads_failing_line_from_stack_else_falls_back() -> None:
    err = Exception("boom")
    err.stack = "Error: boom\n    at handler (steps.ts:1:1)\n    at step (docs/a.md:12:3)"  # type: ignore[attr-defined]
    assert to_failure(err, "docs/a.md", 99).line == 12

    no_frame = Exception("boom")
    no_frame.stack = "Error: boom\n    at handler (steps.ts:1:1)"  # type: ignore[attr-defined]
    assert to_failure(no_frame, "docs/a.md", 99).line == 99


def test_to_failure_regex_escapes_spec_path() -> None:
    # 'X' stands in for the dot: if the spec path's '.' were treated as a
    # regex wildcard it would match this frame; escaped, it must not.
    err = Exception("boom")
    err.stack = "Error: boom\n    at step (aXmd:7:1)"  # type: ignore[attr-defined]
    # specPath "a.md" must NOT match "aXmd"
    assert to_failure(err, "a.md", 42).line == 42
