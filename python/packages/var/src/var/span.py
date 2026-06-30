from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class Span:
    start_offset: int
    end_offset: int
    start_line: int
    start_col: int
    end_line: int
    end_col: int

def utf16_len(s: str) -> int:
    n = 0
    for ch in s:
        n += 2 if ord(ch) > 0xFFFF else 1
    return n

def to_utf16_offset(source: str, cp_index: int) -> int:
    return utf16_len(source[:cp_index])

def _cp_index_for_utf16(source: str, u16: int) -> int:
    # inverse of to_utf16_offset: code-point index at a UTF-16 offset
    count = 0
    for i, ch in enumerate(source):
        if count >= u16:
            return i
        count += 2 if ord(ch) > 0xFFFF else 1
    return len(source)

def utf16_slice(source: str, start_u16: int, end_u16: int) -> str:
    a = _cp_index_for_utf16(source, start_u16)
    b = _cp_index_for_utf16(source, end_u16)
    return source[a:b]

def line_col(source: str, offset_u16: int) -> tuple[int, int]:
    line, col, count = 1, 1, 0
    for ch in source:
        if count >= offset_u16:
            break
        if ch == "\n":
            line, col = line + 1, 1
        else:
            col += 2 if ord(ch) > 0xFFFF else 1
        count += 2 if ord(ch) > 0xFFFF else 1
    return line, col

def span_from_offsets(source: str, start_u16: int, end_u16: int) -> Span:
    sl, sc = line_col(source, start_u16)
    el, ec = line_col(source, end_u16)
    return Span(start_u16, end_u16, sl, sc, el, ec)
