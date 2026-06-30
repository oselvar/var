"""scanner.py — markdown block scanner.

Port of typescript/packages/var-core/src/scanner.ts.

UTF-16 rule: all offsets (start_offset/end_offset in RawLine and Span) count
UTF-16 code units, matching TypeScript's String.charCodeAt / String.length
conventions.  split_lines advances by utf16_len(line_text) + 1 for each \\n.
Where scanner.ts uses line.text.indexOf(rawText) to locate text within a line,
Python uses str.find and then converts the code-point index to a UTF-16 delta
via to_utf16_offset before adding to the (UTF-16) line.start_offset.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from var.ast import (
    Block,
    Blockquote,
    Fence,
    Heading,
    InlineOffset,
    ListItem,
    Paragraph,
    Row,
    Table,
    ThematicBreak,
)
from var.inline import strip_inline
from var.span import span_from_offsets, to_utf16_offset, utf16_len, utf16_slice
from var.table_cells import parse_row_cells


# ── Public types ──────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class RawLine:
    text: str
    start_offset: int
    end_offset: int


class ScannerPlugin(Protocol):
    """Extension point: participates in block recognition before built-in rules."""

    def try_scan(
        self,
        *,
        source: str,
        lines: tuple[RawLine, ...],
        start_idx: int,
    ) -> tuple[Block, int] | None: ...


# ── Regexes (verbatim port of the TS constants) ───────────────────────────────

THEMATIC_RE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")
UL_RE = re.compile(r"^(\s*)([-*+])\s+(.*)$")
OL_RE = re.compile(r"^(\s*)(\d+)([.)])\s+(.*)$")
BQ_RE = re.compile(r"^>\s?(.*)$")
FENCE_RE = re.compile(r"^(`{3,})\s*(\S*)\s*$")
ROW_RE = re.compile(r"^\|(.+)\|\s*$")
DELIM_RE = re.compile(r"^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|\s*$")


# ── Public API ────────────────────────────────────────────────────────────────

def scan(
    source: str,
    plugins: tuple[ScannerPlugin, ...] = (),
) -> tuple[Block, ...]:
    """Scan *source* into an immutable sequence of Block nodes."""
    blocks: list[Block] = []
    lines = split_lines(source)

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.text.strip() == "":
            i += 1
            continue

        matched = run_plugins(source, lines, i, plugins)
        if matched is not None:
            blocks.append(matched[0])
            i = matched[1]
            continue

        fence_result = try_fence(source, lines, i)
        if fence_result is not None:
            blocks.append(fence_result[0])
            i = fence_result[1]
            continue

        table_result = try_table(source, lines, i)
        if table_result is not None:
            blocks.append(table_result[0])
            i = table_result[1]
            continue

        thematic = try_thematic(source, line)
        if thematic is not None:
            blocks.append(thematic)
            i += 1
            continue

        bq_result = try_blockquote(source, lines, i)
        if bq_result is not None:
            blocks.append(bq_result[0])
            i = bq_result[1]
            continue

        heading = try_heading(source, line)
        if heading is not None:
            blocks.append(heading)
            i += 1
            continue

        list_item = try_list_item(source, line)
        if list_item is not None:
            blocks.append(list_item)
            i += 1
            continue

        paragraph, next_i = consume_paragraph(source, lines, i, plugins)
        blocks.append(paragraph)
        i = next_i

    return tuple(blocks)


# ── Internal helpers ──────────────────────────────────────────────────────────

def run_plugins(
    source: str,
    lines: tuple[RawLine, ...],
    start_idx: int,
    plugins: tuple[ScannerPlugin, ...],
) -> tuple[Block, int] | None:
    for p in plugins:
        r = p.try_scan(source=source, lines=lines, start_idx=start_idx)
        if r is not None:
            return r
    return None


def split_lines(source: str) -> tuple[RawLine, ...]:
    """Split *source* into RawLines with UTF-16 start/end offsets.

    Iterates code-point by code-point, tracking both a code-point index (for
    Python string slicing) and a UTF-16 offset (for the RawLine offsets).
    '\\n' is always 1 UTF-16 unit (U+000A is BMP), so start advances by
    utf16_len(line_text) + 1 on each newline.
    """
    out: list[RawLine] = []
    start_u16 = 0
    current_u16 = 0
    start_cp = 0

    for cp_i, ch in enumerate(source):
        if ch == "\n":
            out.append(
                RawLine(
                    text=source[start_cp:cp_i],
                    start_offset=start_u16,
                    end_offset=current_u16,
                )
            )
            # '\n' is U+000A (BMP → 1 UTF-16 unit).
            start_u16 = current_u16 + 1
            start_cp = cp_i + 1
        current_u16 += 2 if ord(ch) > 0xFFFF else 1

    # Append final (or only) line — mirrors TS `if (start <= source.length)`.
    out.append(
        RawLine(
            text=source[start_cp:],
            start_offset=start_u16,
            end_offset=current_u16,
        )
    )
    return tuple(out)


def try_thematic(source: str, line: RawLine) -> Block | None:
    if not THEMATIC_RE.match(line.text):
        return None
    return ThematicBreak(
        span=span_from_offsets(source, line.start_offset, line.end_offset)
    )


def try_heading(source: str, line: RawLine) -> Block | None:
    m = re.match(r"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$", line.text)
    if not m:
        return None
    hashes = m.group(1)
    text = (m.group(2) or "").strip()
    level = len(hashes)
    return Heading(
        level=level,
        text=text,
        span=span_from_offsets(source, line.start_offset, line.end_offset),
    )


def try_list_item(source: str, line: RawLine) -> Block | None:
    ul = UL_RE.match(line.text)
    if ul:
        raw_text = ul.group(3) or ""
        marker_start = line.start_offset + utf16_len(ul.group(1) or "")
        marker_end = marker_start + utf16_len(ul.group(2) or "")
        # str.find returns code-point index; convert to UTF-16 delta before
        # adding to the UTF-16 line.start_offset (mirrors TS indexOf).
        cp_idx = line.text.find(raw_text)
        text_start = line.start_offset + to_utf16_offset(line.text, cp_idx)
        text, inline_map = strip_inline(raw_text, text_start)
        return ListItem(
            text=text,
            span=span_from_offsets(source, line.start_offset, line.end_offset),
            inline_map=inline_map,
            ordered=False,
            marker_span=span_from_offsets(source, marker_start, marker_end),
        )
    ol = OL_RE.match(line.text)
    if ol:
        raw_text = ol.group(4) or ""
        marker_start = line.start_offset + utf16_len(ol.group(1) or "")
        marker_end = (
            marker_start
            + utf16_len(ol.group(2) or "")
            + utf16_len(ol.group(3) or "")
        )
        cp_idx = line.text.find(raw_text)
        text_start = line.start_offset + to_utf16_offset(line.text, cp_idx)
        text, inline_map = strip_inline(raw_text, text_start)
        return ListItem(
            text=text,
            span=span_from_offsets(source, line.start_offset, line.end_offset),
            inline_map=inline_map,
            ordered=True,
            marker_span=span_from_offsets(source, marker_start, marker_end),
        )
    return None


def try_blockquote(
    source: str,
    lines: tuple[RawLine, ...],
    start_idx: int,
) -> tuple[Block, int] | None:
    if start_idx >= len(lines):
        return None
    first = lines[start_idx]
    m = BQ_RE.match(first.text)
    if not m:
        return None

    first_segment_raw = m.group(1) or ""
    cp_idx = first.text.find(first_segment_raw)
    first_segment_source_base = first.start_offset + to_utf16_offset(
        first.text, cp_idx
    )
    first_text, first_map = strip_inline(first_segment_raw, first_segment_source_base)

    stripped_segments: list[str] = [first_text]
    inline_map: list[InlineOffset] = list(first_map)
    # joinedTextOffset tracks UTF-16 units written to the joined text so far.
    joined_text_offset = utf16_len(first_text)

    i = start_idx + 1
    end_offset = first.end_offset
    while i < len(lines):
        ln = lines[i]
        next_m = BQ_RE.match(ln.text)
        if not next_m:
            break
        segment_raw = next_m.group(1) or ""
        cp_idx2 = ln.text.find(segment_raw)
        segment_source_base = ln.start_offset + to_utf16_offset(ln.text, cp_idx2)
        seg_text, seg_map = strip_inline(segment_raw, segment_source_base)

        joined_text_offset += 1  # newline separator (1 UTF-16 unit)
        for entry in seg_map:
            inline_map.append(
                InlineOffset(
                    text_offset=joined_text_offset + entry.text_offset,
                    source_offset=entry.source_offset,
                )
            )
        stripped_segments.append(seg_text)
        joined_text_offset += utf16_len(seg_text)
        end_offset = ln.end_offset
        i += 1

    return (
        Blockquote(
            text="\n".join(stripped_segments),
            span=span_from_offsets(source, first.start_offset, end_offset),
            inline_map=tuple(inline_map),
        ),
        i,
    )


def consume_paragraph(
    source: str,
    lines: tuple[RawLine, ...],
    start_idx: int,
    plugins: tuple[ScannerPlugin, ...],
) -> tuple[Block, int]:
    if start_idx >= len(lines):
        raise ValueError("invariant: start_idx out of range")
    first = lines[start_idx]

    end_idx = start_idx
    while end_idx + 1 < len(lines):
        candidate_idx = end_idx + 1
        candidate = lines[candidate_idx]
        if candidate.text.strip() == "":
            break
        if re.match(r"^#{1,6}\s+", candidate.text):
            break
        if UL_RE.match(candidate.text):
            break
        if OL_RE.match(candidate.text):
            break
        if BQ_RE.match(candidate.text):
            break
        if FENCE_RE.match(candidate.text):
            break
        if ROW_RE.match(candidate.text):
            break
        if THEMATIC_RE.match(candidate.text):
            break
        # Plugins also vote: if any would claim this line, stop the paragraph.
        if run_plugins(source, lines, candidate_idx, plugins):
            break
        end_idx += 1

    if end_idx >= len(lines):
        raise ValueError("invariant: end_idx out of range")
    last = lines[end_idx]

    start_offset = first.start_offset
    end_offset = last.end_offset
    # Use utf16_slice to extract the raw text via UTF-16 offsets (mirrors
    # TS source.slice(startOffset, endOffset) which uses UTF-16 indices).
    raw_text = utf16_slice(source, start_offset, end_offset)
    text, inline_map = strip_inline(raw_text, start_offset)
    return (
        Paragraph(
            text=text,
            span=span_from_offsets(source, start_offset, end_offset),
            inline_map=inline_map,
        ),
        end_idx + 1,
    )


def try_fence(
    source: str,
    lines: tuple[RawLine, ...],
    start_idx: int,
) -> tuple[Block, int] | None:
    if start_idx >= len(lines):
        return None
    start = lines[start_idx]
    open_m = FENCE_RE.match(start.text)
    if not open_m:
        return None
    fence_marker = open_m.group(1) or ""
    info = (open_m.group(2) or "").strip()

    i = start_idx + 1
    body_start: int | None = None
    body_end: int | None = None
    end_offset = start.end_offset

    while i < len(lines):
        ln = lines[i]
        close_m = FENCE_RE.match(ln.text)
        if close_m and len(close_m.group(1) or "") >= len(fence_marker):
            end_offset = ln.end_offset
            break
        if body_start is None:
            body_start = ln.start_offset
        body_end = ln.end_offset + 1  # +1 to include the '\n' after this line
        i += 1

    if body_start is not None and body_end is not None:
        body = utf16_slice(source, body_start, body_end)
    else:
        body = ""

    fallback = start.end_offset
    body_span = span_from_offsets(
        source,
        body_start if body_start is not None else fallback,
        body_end if body_end is not None else fallback,
    )
    return (
        Fence(
            info=info,
            body=body,
            body_span=body_span,
            span=span_from_offsets(source, start.start_offset, end_offset),
        ),
        i + 1,
    )


def try_table(
    source: str,
    lines: tuple[RawLine, ...],
    start_idx: int,
) -> tuple[Block, int] | None:
    if start_idx + 1 >= len(lines):
        return None
    header_line = lines[start_idx]
    delim_line = lines[start_idx + 1]

    if not ROW_RE.match(header_line.text):
        return None
    if not DELIM_RE.match(delim_line.text):
        return None

    header_cells, header_cell_spans = parse_row_cells(
        header_line.text, header_line.start_offset, source
    )
    header = Row(
        cells=header_cells,
        cell_spans=header_cell_spans,
        span=span_from_offsets(
            source, header_line.start_offset, header_line.end_offset
        ),
    )

    rows: list[Row] = []
    i = start_idx + 2
    while i < len(lines):
        ln = lines[i]
        if not ROW_RE.match(ln.text):
            break
        cells, cell_spans = parse_row_cells(ln.text, ln.start_offset, source)
        rows.append(
            Row(
                cells=cells,
                cell_spans=cell_spans,
                span=span_from_offsets(source, ln.start_offset, ln.end_offset),
            )
        )
        i += 1

    last_row = rows[-1] if rows else None
    end_offset = (
        last_row.span.end_offset if last_row is not None else delim_line.end_offset  # type: ignore[union-attr]
    )
    return (
        Table(
            span=span_from_offsets(source, header_line.start_offset, end_offset),
            header=header,
            rows=tuple(rows),
        ),
        i,
    )
