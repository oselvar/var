# test_span.py
from var.span import utf16_len, to_utf16_offset, utf16_slice, line_col, span_from_offsets

def test_utf16_len_ascii_and_astral():
    assert utf16_len("abc") == 3
    assert utf16_len("é") == 1          # BMP: 1 code unit
    assert utf16_len("😀") == 2          # astral: surrogate pair
    assert utf16_len("a😀b") == 4

def test_to_utf16_offset_counts_units_before_cp_index():
    s = "a😀b"                           # cp indices: a=0 😀=1 b=2
    assert to_utf16_offset(s, 0) == 0
    assert to_utf16_offset(s, 1) == 1    # after "a"
    assert to_utf16_offset(s, 2) == 3    # after "a😀" (1+2)

def test_utf16_slice_roundtrips_through_units():
    s = "x😀y"                           # u16: x=0 😀=1..3 y=3
    assert utf16_slice(s, 0, 1) == "x"
    assert utf16_slice(s, 1, 3) == "😀"
    assert utf16_slice(s, 3, 4) == "y"

def test_line_col_counts_utf16_units():
    s = "ab\n😀x"                        # u16 offsets: a0 b1 \n2 😀3-4 x5
    assert line_col(s, 1) == (1, 2)
    assert line_col(s, 5) == (2, 3)      # col counts the astral char as 2

def test_span_from_offsets():
    sp = span_from_offsets("hello", 0, 5)
    assert (sp.start_offset, sp.end_offset, sp.start_line, sp.start_col, sp.end_line, sp.end_col) == (0, 5, 1, 1, 1, 6)
