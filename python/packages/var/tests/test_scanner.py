"""test_scanner.py — block scanner tests.

Ported from typescript/packages/var-core/tests/scanner.test.ts.
UTF-16 rule: span offsets count UTF-16 code units.
"""

from __future__ import annotations

import pytest

from var.ast import Fence, InlineOffset, Paragraph
from var.scanner import scan
from var.span import Span


# ── Heading tests ────────────────────────────────────────────────────────────

def test_scan_finds_single_h1_heading() -> None:
    blocks = scan("# Hello")
    assert len(blocks) == 1
    h = blocks[0]
    assert h.kind == "heading"
    assert h.level == 1  # type: ignore[union-attr]
    assert h.text == "Hello"  # type: ignore[union-attr]
    assert h.span == Span(
        start_offset=0,
        end_offset=7,
        start_line=1,
        start_col=1,
        end_line=1,
        end_col=8,
    )


def test_scan_finds_headings_at_all_levels() -> None:
    source = "# a\n## b\n### c\n#### d\n##### e\n###### f"
    blocks = scan(source)
    levels = [b.level for b in blocks if b.kind == "heading"]  # type: ignore[union-attr]
    assert levels == [1, 2, 3, 4, 5, 6]


def test_scan_ignores_headings_with_more_than_6_hashes() -> None:
    blocks = scan("####### too deep")
    assert not any(b.kind == "heading" for b in blocks)


def test_scan_strips_optional_trailing_hash_marker() -> None:
    blocks = scan("## Hello ##")
    h = blocks[0]
    assert h.kind == "heading"
    assert h.text == "Hello"  # type: ignore[union-attr]


# ── Paragraph tests ──────────────────────────────────────────────────────────

def test_scan_groups_consecutive_non_blank_lines_into_single_paragraph() -> None:
    source = "first line\nsecond line\n\nthird line"
    blocks = scan(source)
    paragraphs = [b for b in blocks if b.kind == "paragraph"]
    assert len(paragraphs) == 2
    assert paragraphs[0].text == "first line\nsecond line"  # type: ignore[union-attr]
    assert paragraphs[1].text == "third line"  # type: ignore[union-attr]


def test_paragraph_span_covers_full_multi_line_range() -> None:
    source = "first line\nsecond line\n\nthird line"
    blocks = scan(source)
    p1 = next(b for b in blocks if b.kind == "paragraph")
    assert isinstance(p1, Paragraph)
    assert p1.span.start_offset == 0
    assert p1.span.end_offset == len("first line\nsecond line")  # 22 — all ASCII
    assert p1.span.start_line == 1
    assert p1.span.end_line == 2


def test_paragraph_inline_map_maps_text_offsets_to_source_offsets() -> None:
    source = "# Heading\n\nhello world"
    blocks = scan(source)
    paragraph = next((b for b in blocks if b.kind == "paragraph"), None)
    assert paragraph is not None
    assert isinstance(paragraph, Paragraph)
    # "hello world" lives at source offset 11 (after "# Heading\n\n")
    assert paragraph.inline_map[0] == InlineOffset(text_offset=0, source_offset=11)


# ── Astral-character paragraph (UTF-16 offset assertion) ─────────────────────

def test_astral_paragraph_span_end_offset_is_utf16() -> None:
    """Paragraph containing an astral char must have end_offset in UTF-16 units.

    U+1F389 PARTY POPPER is 1 Python code point but 2 UTF-16 code units.
    Source '\U0001f389 hello' has 7 code points = 8 UTF-16 units.
    end_offset must be 8, not 7.
    """
    source = "\U0001f389 hello"  # 🎉 space h e l l o
    blocks = scan(source)
    assert len(blocks) == 1
    p = blocks[0]
    assert isinstance(p, Paragraph)
    # 🎉 = 2 UTF-16, space+hello = 6 UTF-16 → total 8
    assert p.span.end_offset == 8  # NOT 7 (code-point count)
    assert p.span.start_offset == 0


# ── Fence tests ──────────────────────────────────────────────────────────────

def test_scan_recognizes_fenced_code_block_with_info_string() -> None:
    source = '# Title\n\n```json\n{ "a": 1 }\n```\n'
    blocks = scan(source)
    fence = next((b for b in blocks if b.kind == "fence"), None)
    assert fence is not None
    assert isinstance(fence, Fence)
    assert fence.info == "json"
    assert fence.body == '{ "a": 1 }\n'


def test_scan_tolerates_fence_with_no_info_string() -> None:
    blocks = scan("```\nplain body\n```")
    fence = next((b for b in blocks if b.kind == "fence"), None)
    assert fence is not None
    assert isinstance(fence, Fence)
    assert fence.info == ""
    assert fence.body == "plain body\n"


def test_scan_does_not_split_paragraphs_across_fence() -> None:
    source = "paragraph above\n\n```\nbody\n```\n\nparagraph below"
    blocks = scan(source)
    assert [b.kind for b in blocks] == ["paragraph", "fence", "paragraph"]


# ── Table tests ──────────────────────────────────────────────────────────────

def test_scan_recognizes_gfm_table_with_header_delimiter_rows() -> None:
    source = "| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |\n"
    blocks = scan(source)
    table = next((b for b in blocks if b.kind == "table"), None)
    assert table is not None
    assert table.header.cells == ("name", "age")  # type: ignore[union-attr]
    assert len(table.rows) == 2  # type: ignore[union-attr]
    assert table.rows[0].cells == ("Bob", "30")  # type: ignore[union-attr]
    assert table.rows[1].cells == ("Eve", "25")  # type: ignore[union-attr]


def test_row_without_following_delimiter_is_a_paragraph() -> None:
    blocks = scan("| not | a | table |")
    assert blocks[0].kind == "paragraph"


# ── Thematic break tests ─────────────────────────────────────────────────────

@pytest.mark.parametrize("mark", ["---", "***", "___", "----", "* * *"])
def test_recognizes_thematic_break(mark: str) -> None:
    source = f"a\n\n{mark}\n\nb"
    blocks = scan(source)
    assert [b.kind for b in blocks] == ["paragraph", "thematic_break", "paragraph"]


# ── List item tests ──────────────────────────────────────────────────────────

def test_scan_recognizes_unordered_list_items() -> None:
    blocks = scan(
        "- Given I have 100\n- When I withdraw 40\n- Then I should have 60"
    )
    assert [b.kind for b in blocks] == ["list_item", "list_item", "list_item"]
    first = blocks[0]
    assert first.kind == "list_item"
    assert first.ordered is False  # type: ignore[union-attr]
    assert first.text == "Given I have 100"  # type: ignore[union-attr]


def test_scan_recognizes_ordered_list_items() -> None:
    blocks = scan("1. First step\n2. Second step")
    assert [b.kind for b in blocks] == ["list_item", "list_item"]
    first = blocks[0]
    assert first.kind == "list_item"
    assert first.ordered is True  # type: ignore[union-attr]


# ── Blockquote tests ─────────────────────────────────────────────────────────

def test_scan_recognizes_blockquotes() -> None:
    blocks = scan("> Given I have 100\n> When I withdraw 40")
    assert len(blocks) == 1
    bq = blocks[0]
    assert bq.kind == "blockquote"
    assert bq.text == "Given I have 100\nWhen I withdraw 40"  # type: ignore[union-attr]
