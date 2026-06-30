"""sentences.py — port of typescript/packages/var-core/src/sentences.ts.

Splits a block of plain text into sentences on . ! ? and \\n, skipping
terminators inside backtick spans and double-quoted strings and treating
common abbreviations as non-breaking.

All start_offset / end_offset values are UTF-16 code-unit offsets into the
original *text* string, matching JavaScript's string-index convention (the
TypeScript source operates on JS UTF-16 strings directly).
"""
from __future__ import annotations

from dataclasses import dataclass

_ABBREVIATIONS: frozenset[str] = frozenset(["e.g.", "i.e.", "etc.", "cf.", "vs."])


@dataclass(frozen=True, slots=True)
class Sentence:
    text: str
    start_offset: int  # UTF-16 offset into the source block text
    end_offset: int    # UTF-16 offset into the source block text


def _build_cp_to_u16(text: str) -> list[int]:
    """Return a list where cp_to_u16[cp_i] is the UTF-16 offset of text[cp_i]."""
    result: list[int] = [0] * (len(text) + 1)
    u16 = 0
    for i, ch in enumerate(text):
        result[i] = u16
        u16 += 2 if ord(ch) > 0xFFFF else 1
    result[len(text)] = u16
    return result


def _is_inside_number_or_abbrev(text: str, dot_pos: int) -> bool:
    """Mirror isInsideNumberOrAbbrev from sentences.ts."""
    prev = text[dot_pos - 1] if dot_pos > 0 else ""
    nxt = text[dot_pos + 1] if dot_pos + 1 < len(text) else ""
    # Digit . Digit → decimal number
    if prev.isdigit() and nxt.isdigit():
        return True
    # Known abbreviations ending at dot_pos+1
    for abbrev in _ABBREVIATIONS:
        start = max(0, dot_pos + 1 - len(abbrev))
        if text[start : dot_pos + 1] == abbrev:
            return True
    # Lowercase letter following → likely intra-word
    if nxt.islower():
        return True
    return False


def _push_segment(
    out: list[Sentence],
    text: str,
    start_cp: int,
    end_cp: int,
    cp_to_u16: list[int],
) -> None:
    """Mirror pushSegment from sentences.ts.

    Trims whitespace; if anything remains, appends a Sentence with UTF-16
    start/end offsets that correspond to the trimmed content.
    """
    if end_cp <= start_cp:
        return
    raw = text[start_cp:end_cp]
    stripped = raw.strip()
    if not stripped:
        return
    # Leading and trailing whitespace are all ASCII (1 u16 unit each).
    lead = len(raw) - len(raw.lstrip())
    trail = len(raw) - len(raw.rstrip())
    trimmed_start_cp = start_cp + lead
    trimmed_end_cp = end_cp - trail
    start_u16 = cp_to_u16[trimmed_start_cp]
    end_u16 = cp_to_u16[trimmed_end_cp]
    out.append(Sentence(text=stripped, start_offset=start_u16, end_offset=end_u16))


def split_sentences(text: str) -> tuple[Sentence, ...]:
    """Split *text* into sentences, returning UTF-16 offsets.

    Faithful port of splitSentences in sentences.ts:
    * Backtick spans and double-quoted strings are no-split zones.
    * Splits on . ! ? \\n (unless inside a no-split zone or an abbreviation).
    * Whitespace after a terminator is consumed before the next segment starts.
    """
    cp_to_u16 = _build_cp_to_u16(text)
    n = len(text)
    out: list[Sentence] = []

    # Mark no-split zones (backtick spans, double-quoted strings).
    skip: list[bool] = [False] * n
    j = 0
    while j < n:
        c = text[j]
        if c == "`":
            close = text.find("`", j + 1)
            if close == -1:
                break
            for k in range(j, close + 1):
                skip[k] = True
            j = close + 1
            continue
        if c == '"':
            close = text.find('"', j + 1)
            if close == -1:
                break
            for k in range(j, close + 1):
                skip[k] = True
            j = close + 1
            continue
        j += 1

    i = 0
    segment_start = 0

    while i < n:
        if skip[i]:
            i += 1
            continue
        ch = text[i]
        if ch in ("\n", ".", "!", "?"):
            if ch == "." and _is_inside_number_or_abbrev(text, i):
                i += 1
                continue
            end = i + 1
            _push_segment(out, text, segment_start, end, cp_to_u16)
            i = end
            # Skip following whitespace (spaces + newlines).
            while i < n and text[i] in (" ", "\n"):
                i += 1
            segment_start = i
            continue
        i += 1

    _push_segment(out, text, segment_start, n, cp_to_u16)
    return tuple(out)
