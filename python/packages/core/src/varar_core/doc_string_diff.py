"""doc_string_diff.py — port of typescript/packages/core/src/doc-string-diff.ts.

Pure comparison of a doc-string step's return value against the fence body.
"""
from __future__ import annotations

import json
from typing import Any

from varar_core.cell_diff import CellDiff, ReturnShapeError
from varar_core.span import Span

# The column label a doc-string cell carries in a CellDiff, so its mismatch
# message reads ``doc string: expected … but was …``.
DOC_STRING_COLUMN = "doc string"


def _quote(s: str) -> str:
    """Render *s* the way JSON.stringify does in the TypeScript port.

    Every port quotes doc-string cells identically (Java/Rust/Go use a
    hand-rolled quote(), Ruby uses String#inspect) because the message text is
    matched by substring in an ``error`` fence — a port that quotes differently
    fails a spec its siblings pass. Python's repr would emit single quotes.
    """
    return json.dumps(s)


def compare_doc_string(
    returned: Any,
    content: str,
    span: Span,
) -> CellDiff | None:
    """Compare a doc-string step's return against the fence body.

    A doc string is ONE CELL, compared whole, so a difference is an ordinary
    CellDiff and the executor raises the same CellMismatchError as any other
    cell. ``expected``/``actual`` are JSON-quoted: a doc string routinely differs
    only in whitespace, and bare text would render a missing trailing newline as
    no difference at all.

    - ``None``    → no check (returns None)
    - equal str   → returns None (pass)
    - unequal str → returns a CellDiff labelled "doc string"
    - non-string  → raises ReturnShapeError
    """
    if returned is None:
        return None
    if not isinstance(returned, str):
        raise ReturnShapeError(
            f"expected a doc string (string), got {type(returned).__name__}"
        )
    if returned == content:
        return None
    return CellDiff(
        column=DOC_STRING_COLUMN,
        span=span,
        expected=_quote(content),
        actual=_quote(returned),
        ok=False,
    )
