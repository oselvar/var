"""
Tests for parse_row_cells — ported from var-core/tests/scanner.test.ts
(the table-cell span cases) and from table-cells.ts behaviour directly.
"""

from var.span import utf16_slice
from var.table_cells import parse_row_cells


def test_basic_row_returns_trimmed_cells() -> None:
    """| a | b | → cells ("a", "b")"""
    source = "| a | b |"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ("a", "b")


def test_basic_row_spans_point_to_trimmed_text() -> None:
    """Cell spans slice back to the trimmed cell text (ASCII only)."""
    source = "| a | b |"
    cells, spans = parse_row_cells(source, 0, source)
    assert len(spans) == 2
    assert utf16_slice(source, spans[0].start_offset, spans[0].end_offset) == "a"
    assert utf16_slice(source, spans[1].start_offset, spans[1].end_offset) == "b"


def test_extra_padding_trimmed() -> None:
    """| Bob  | 30  | trims to ("Bob", "30")."""
    source = "| Bob  | 30  |"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ("Bob", "30")
    assert utf16_slice(source, spans[0].start_offset, spans[0].end_offset) == "Bob"
    assert utf16_slice(source, spans[1].start_offset, spans[1].end_offset) == "30"


def test_no_pipe_returns_empty() -> None:
    """A line with no pipe returns empty tuples."""
    source = "hello world"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ()
    assert spans == ()


def test_single_pipe_returns_empty() -> None:
    """A line with only one pipe (last <= first) returns empty."""
    source = "| only one"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ()
    assert spans == ()


def test_single_column_table_row() -> None:
    """| n | → cells ("n",)"""
    source = "| n |"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ("n",)
    assert utf16_slice(source, spans[0].start_offset, spans[0].end_offset) == "n"


def test_line_start_offset_shifts_spans() -> None:
    """When the row is not at offset 0, line_start_offset shifts all spans."""
    prefix = "# T\n\n"
    row = "| a | b |"
    source = prefix + row
    # line_start_offset is the UTF-16 offset of the row's first char in source
    line_start = len(prefix)  # all ASCII, so code-point == UTF-16
    cells, spans = parse_row_cells(row, line_start, source)
    assert cells == ("a", "b")
    assert utf16_slice(source, spans[0].start_offset, spans[0].end_offset) == "a"
    assert utf16_slice(source, spans[1].start_offset, spans[1].end_offset) == "b"


def test_astral_cell_shifts_following_span() -> None:
    """
    A cell containing an astral character (U+1F389, 2 UTF-16 code units)
    must shift the following cell's span by 2, not 1.

    Source (as UTF-16 offsets):
      0   |
      1   (space)
      2-3 🎉  (surrogate pair — 2 UTF-16 units)
      4   (space)
      5   |
      6   (space)
      7   a
      8   (space)
      9   |

    So 🎉 span = (2, 4), 'a' span = (7, 8).
    """
    source = "| \U0001f389 | a |"  # U+1F389 PARTY POPPER
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ("\U0001f389", "a")
    # 🎉 is at UTF-16 offsets 2..4
    assert spans[0].start_offset == 2
    assert spans[0].end_offset == 4
    # 'a' must be at UTF-16 offset 7 (not 6), shifted by the extra surrogate unit
    assert spans[1].start_offset == 7
    assert spans[1].end_offset == 8
    # Round-trip via utf16_slice
    assert utf16_slice(source, spans[0].start_offset, spans[0].end_offset) == "\U0001f389"
    assert utf16_slice(source, spans[1].start_offset, spans[1].end_offset) == "a"


def test_three_column_row() -> None:
    """| name | age | city | → three cells with correct spans."""
    source = "| name | age | city |"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ("name", "age", "city")
    for i, expected in enumerate(("name", "age", "city")):
        assert utf16_slice(source, spans[i].start_offset, spans[i].end_offset) == expected


def test_delimiter_row_gives_dashes() -> None:
    """| --- | --- | parses as cells ('---', '---') — delimiter rows are not special here."""
    source = "| --- | --- |"
    cells, spans = parse_row_cells(source, 0, source)
    assert cells == ("---", "---")
