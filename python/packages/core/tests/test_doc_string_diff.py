"""test_doc_string_diff.py — port of typescript/packages/core/tests/doc-string-diff.test.ts"""
from __future__ import annotations

import pytest

from varar_core.cell_diff import CellMismatchError, ReturnShapeError
from varar_core.doc_string_diff import DOC_STRING_COLUMN, compare_doc_string
from varar_core.span import Span

_span = Span(start_offset=0, end_offset=6, start_line=1, start_col=1, end_line=1, end_col=6)


def test_equal_content_returns_none() -> None:
    assert compare_doc_string("hello\n", "hello\n", _span) is None


def test_none_return_returns_none_asserted_nothing() -> None:
    assert compare_doc_string(None, "hello\n", _span) is None


def test_different_content_returns_a_cell_labelled_doc_string() -> None:
    # A doc string is one cell, compared whole. expected/actual are JSON-quoted
    # so a whitespace-only difference stays visible.
    result = compare_doc_string("bye\n", "hello\n", _span)
    assert result is not None
    assert result.column == DOC_STRING_COLUMN
    assert result.span == _span
    assert result.expected == '"hello\\n"'
    assert result.actual == '"bye\\n"'
    assert result.ok is False


def test_a_doc_string_cell_reads_like_any_other_cell_mismatch() -> None:
    diff = compare_doc_string("bye\n", "hello\n", _span)
    assert diff is not None
    assert str(CellMismatchError([diff])) == 'doc string: expected "hello\\n" but was "bye\\n"'


def test_non_string_return_raises_return_shape_error() -> None:
    with pytest.raises(ReturnShapeError):
        compare_doc_string(42, "hello\n", _span)
