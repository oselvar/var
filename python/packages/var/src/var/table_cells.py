"""
Parse a Markdown/Gherkin table row into trimmed cells and per-cell source spans.

Port of: typescript/packages/var-core/src/table-cells.ts

UTF-16 rule: all offsets (including line_start_offset and emitted Span offsets)
count UTF-16 code units, matching JavaScript's native string indexing so that
span values are identical between the TS and Python implementations.
"""

from var.span import Span, span_from_offsets, utf16_len, to_utf16_offset


def parse_row_cells(
    line_text: str,
    line_start_offset: int,
    source: str,
) -> tuple[tuple[str, ...], tuple[Span, ...]]:
    """Split a ``| a | b |`` table row into trimmed cells and per-cell spans.

    Parameters
    ----------
    line_text:
        The raw text of the row (e.g. ``"| a | b |"``).
    line_start_offset:
        UTF-16 offset of the first character of *line_text* within *source*.
    source:
        The full document source (used by :func:`span_from_offsets` to compute
        line/column coordinates).

    Returns
    -------
    (cells, cell_spans)
        *cells* — tuple of trimmed cell strings.
        *cell_spans* — tuple of :class:`~var.span.Span` objects, one per cell,
        with ``start_offset``/``end_offset`` in UTF-16 units pointing at the
        trimmed cell text within *source*.
    """
    first_cp = line_text.find("|")
    last_cp = line_text.rfind("|")
    if first_cp < 0 or last_cp <= first_cp:
        return ((), ())

    # Convert code-point positions of the pipe characters to UTF-16 offsets
    # within line_text (matters when astral chars appear before the pipe).
    first_u16 = to_utf16_offset(line_text, first_cp)
    # inner_start is the UTF-16 offset within line_text of the char after the
    # opening '|'.  '|' is ASCII so it always takes exactly 1 UTF-16 unit.
    inner_start_u16 = first_u16 + 1

    # Extract the text between the first and last pipe using code-point slices
    # (Python slicing operates on code points, which is what we want for the
    # string values; we track UTF-16 widths separately for offset arithmetic).
    inner = line_text[first_cp + 1 : last_cp]

    cells: list[str] = []
    cell_spans: list[Span] = []
    cursor = 0  # running UTF-16 position within inner

    for seg in inner.split("|"):
        trimmed = seg.strip()
        # Number of leading-whitespace UTF-16 units (whitespace is always BMP,
        # but use utf16_len for correctness and symmetry with the TS port).
        leading = utf16_len(seg) - utf16_len(seg.lstrip())
        abs_start = line_start_offset + inner_start_u16 + cursor + leading
        cells.append(trimmed)
        cell_spans.append(
            span_from_offsets(source, abs_start, abs_start + utf16_len(trimmed))
        )
        cursor += utf16_len(seg) + 1  # +1 for the '|' delimiter itself

    return (tuple(cells), tuple(cell_spans))
