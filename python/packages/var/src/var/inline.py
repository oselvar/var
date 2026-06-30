"""inline.py — strip inline Markdown markup, producing (text, offset-map).

Port of typescript/packages/var-core/src/inline.ts.

All offsets (source_base, emitted text_offset, source_offset entries) are
UTF-16 code units, matching TypeScript's string indexing conventions.
"""

from __future__ import annotations

from var.ast import InlineOffset
from var.span import utf16_len


def _cp_to_u16(s: str, cp_idx: int) -> int:
    """UTF-16 offset of the code-point at cp_idx (sum of u16 widths before it)."""
    return utf16_len(s[:cp_idx])


def _is_word(ch: str | None) -> bool:
    """True when ch is a Unicode letter, digit, or underscore (mirrors TS \\p{L}\\p{N}_)."""
    if not ch:
        return False
    return ch.isalnum() or ch == "_"


def _find_matching(text: str, start: int, open_ch: str, close_ch: str) -> int:
    """Return code-point index of the matching close_ch, or -1."""
    depth = 0
    for j in range(start, len(text)):
        if text[j] == open_ch:
            depth += 1
        elif text[j] == close_ch:
            depth -= 1
            if depth == 0:
                return j
    return -1


def strip_inline(raw_text: str, source_base: int) -> tuple[str, tuple[InlineOffset, ...]]:
    """Strip inline Markdown markers from raw_text.

    Returns (plain_text, offset_map) where every InlineOffset maps a UTF-16
    text_offset in plain_text back to the corresponding UTF-16 source_offset
    (relative to the document start, not raw_text start).

    source_base is the UTF-16 offset of raw_text[0] in the full document.
    """
    out: list[str] = []
    map_list: list[InlineOffset] = []
    text_offset = 0  # UTF-16 units written to out so far
    cp_i = 0        # current code-point index in raw_text
    u16_i = 0       # UTF-16 offset of raw_text[cp_i] (maintained incrementally)
    n = len(raw_text)

    def push_offset(source_offset: int) -> None:
        """Dedup-push: only record when text_offset advanced since last entry."""
        last = map_list[-1] if map_list else None
        if last is None or last.text_offset != text_offset:
            map_list.append(InlineOffset(text_offset=text_offset, source_offset=source_offset))

    while cp_i < n:
        ch = raw_text[cp_i]

        # ── Backtick code span ──────────────────────────────────────────────
        if ch == "`":
            close_cp = raw_text.find("`", cp_i + 1)
            if close_cp == -1:
                # No matching close — copy backtick literally.
                push_offset(source_base + u16_i)
                out.append(ch)
                text_offset += 1  # backtick is ASCII (1 u16 unit)
                u16_i += 1
                cp_i += 1
                continue
            # Keep the whole span verbatim, backticks included.
            push_offset(source_base + u16_i)
            span_str = raw_text[cp_i : close_cp + 1]
            out.append(span_str)
            text_offset += utf16_len(span_str)
            cp_i = close_cp + 1
            u16_i = _cp_to_u16(raw_text, cp_i)
            continue

        # ── Inline link [text](url) ─────────────────────────────────────────
        if ch == "[":
            close_cp = _find_matching(raw_text, cp_i, "[", "]")
            next_cp = close_cp + 1 if close_cp >= 0 else -1
            next_ch = raw_text[next_cp] if 0 <= next_cp < n else ""
            if close_cp > cp_i and next_ch == "(":
                close_paren_cp = raw_text.find(")", next_cp + 1)
                if close_paren_cp != -1:
                    inner = raw_text[cp_i + 1 : close_cp]
                    # '[' is ASCII so inner starts at u16_i + 1
                    push_offset(source_base + u16_i + 1)
                    out.append(inner)
                    text_offset += utf16_len(inner)
                    cp_i = close_paren_cp + 1
                    u16_i = _cp_to_u16(raw_text, cp_i)
                    continue

        # ── Emphasis: * or _ ────────────────────────────────────────────────
        if ch in ("*", "_"):
            next_ch = raw_text[cp_i + 1] if cp_i + 1 < n else ""
            prev_ch = raw_text[cp_i - 1] if cp_i > 0 else ""
            # Guard mirrors TS: enter only when next==ch OR prev!=ch.
            # (Prevents re-entering the second char of a processed double marker.)
            if next_ch == ch or prev_ch != ch:
                is_double = next_ch == ch
                marker_length = 2 if is_double else 1
                # CommonMark: _ only opens emphasis at a word boundary.
                if ch == "_" and _is_word(prev_ch) and _is_word(
                    raw_text[cp_i + marker_length] if cp_i + marker_length < n else ""
                ):
                    pass  # mid-word underscore — fall through to literal copy
                else:
                    marker = ch * marker_length
                    close_at_cp = raw_text.find(marker, cp_i + marker_length)
                    # > (not >=) — inner must be non-empty
                    if close_at_cp > cp_i + marker_length:
                        inner = raw_text[cp_i + marker_length : close_at_cp]
                        # Markers are ASCII so inner starts at u16_i + marker_length
                        push_offset(source_base + u16_i + marker_length)
                        out.append(inner)
                        text_offset += utf16_len(inner)
                        cp_i = close_at_cp + marker_length
                        u16_i = _cp_to_u16(raw_text, cp_i)
                        continue

        # ── Default: copy character literally ──────────────────────────────
        push_offset(source_base + u16_i)
        out.append(ch)
        u16_cp_units = 2 if ord(ch) > 0xFFFF else 1
        text_offset += u16_cp_units
        u16_i += u16_cp_units
        cp_i += 1

    # Fallback for empty input (map must have at least one entry).
    if not map_list:
        map_list.append(InlineOffset(text_offset=0, source_offset=source_base))

    return "".join(out), tuple(map_list)
