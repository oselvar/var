from __future__ import annotations

from dataclasses import dataclass
from typing import Union

from varar_core.span import Span


# Maps a block-text offset to its source offset. Block text is the raw
# source minus BLOCK markers only (list bullets, blockquote `>` prefixes),
# so a paragraph or list item has a single entry and a blockquote one entry
# per quoted line. Inline markup is never stripped — see
# doc/superpowers/specs/2026-07-06-explicit-inline-format-plugins-design.md.
@dataclass(frozen=True, slots=True)
class SegmentOffset:
    text_offset: int
    source_offset: int


@dataclass(frozen=True, slots=True)
class Heading:
    kind: str = "heading"
    level: int = 0
    text: str = ""
    span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class Paragraph:
    kind: str = "paragraph"
    text: str = ""
    span: Span | None = None
    segment_map: tuple[SegmentOffset, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class ListItem:
    kind: str = "list_item"
    text: str = ""
    span: Span | None = None
    segment_map: tuple[SegmentOffset, ...] = ()
    ordered: bool = False
    marker_span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")
        if self.marker_span is None:
            raise TypeError("marker_span is required")


@dataclass(frozen=True, slots=True)
class Blockquote:
    kind: str = "blockquote"
    text: str = ""
    span: Span | None = None
    segment_map: tuple[SegmentOffset, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class Row:
    cells: tuple[str, ...] = ()
    cell_spans: tuple[Span, ...] = ()
    span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class Table:
    kind: str = "table"
    span: Span | None = None
    header: Row | None = None
    rows: tuple[Row, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")
        if self.header is None:
            raise TypeError("header is required")


@dataclass(frozen=True, slots=True)
class Fence:
    kind: str = "fence"
    span: Span | None = None
    info: str = ""
    body: str = ""
    body_span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")
        if self.body_span is None:
            raise TypeError("body_span is required")


@dataclass(frozen=True, slots=True)
class ThematicBreak:
    kind: str = "thematic_break"
    span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


Block = Union[Heading, Paragraph, ListItem, Blockquote, Table, Fence, ThematicBreak]


@dataclass(frozen=True, slots=True)
class Example:
    scope_stack: tuple[str, ...] = ()
    span: Span | None = None
    body: tuple[Block, ...] = ()
    # True when a heading or thematic break (`---`) sits between this candidate
    # and the previous one — i.e. a syntactic delimiter separates them (also true
    # for the first candidate). The planner uses it to decide grouping: a matching
    # candidate with this false merges into the open example rather than starting
    # a new one. See ADR 0012.
    preceded_by_delimiter: bool = True

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class VarDoc:
    path: str = ""
    source: str = ""
    examples: tuple[Example, ...] = ()
    orphan_attachments: tuple[Union[Table, Fence], ...] = ()
