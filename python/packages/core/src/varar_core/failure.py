"""failure.py — port of typescript/packages/core/src/failure.ts.

Converts a thrown step error into the structured ExampleFailure payload.
Shared by every producer so failures are byte-identical.
"""
from __future__ import annotations

import re
from typing import Any

from varar_core.cell_diff import is_cell_mismatch_error
from varar_core.result import CellFailure, ExampleFailure


def _failing_line(stack: str, spec_path: str) -> int | None:
    """Recover the 1-based failing line from a ``<specPath>:line:col`` frame."""
    escaped = re.escape(spec_path)
    m = re.search(rf"{escaped}:(\d+):\d+", stack)
    return int(m.group(1)) if m else None


def to_failure(
    error: Any,
    spec_path: str,
    fallback_line: int,
) -> ExampleFailure:
    """Convert a thrown step error to an ExampleFailure.

    Checks for ``CellMismatchError`` first to
    populate structured ``cells``/``doc`` payloads; falls back to a plain
    message + stack for any other exception.

    ``error.stack`` (if present as a string attribute) is used verbatim — this
    matches the TypeScript port where execute.ts injects a ``<specPath>:line:col``
    frame that ``_failing_line`` then extracts.
    """
    # Prefer a manually-set .stack attribute (mirrors TS Error.stack behaviour).
    raw_stack = getattr(error, "stack", None)
    stack: str = raw_stack if isinstance(raw_stack, str) else str(error)
    message: str = str(error)

    cells: tuple[CellFailure, ...] | None = None
    if is_cell_mismatch_error(error):
        failing = tuple(
            CellFailure(
                from_=c.span.start_offset,
                to=c.span.end_offset,
                actual=c.actual,
            )
            for c in error.cells
            if not c.ok
        )
        if failing:
            cells = failing

    line = _failing_line(stack, spec_path) if stack else None

    return ExampleFailure(
        line=line if line is not None else fallback_line,
        message=message,
        stack=stack,
        cells=cells,
    )
