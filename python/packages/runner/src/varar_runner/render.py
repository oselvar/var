"""render.py — pure human-readable rendering of var diff errors.

Pure function: no I/O, no side effects.
"""
from __future__ import annotations

from varar_core.cell_diff import ReturnShapeError, is_cell_mismatch_error


def render_failure(error: BaseException, source: str, path: str) -> str:  # noqa: ARG001
    """Render a step failure as a human-readable, markdown-anchored string.

    Dispatches on the concrete error type:
    - CellMismatchError   → list each failing cell with column/expected/actual/line.
    - ReturnShapeError    → its message.
    - Any other exception → ``TypeName: message``.

    ``source`` is available for additional context but line numbers from spans
    are the primary anchor.
    """
    if is_cell_mismatch_error(error):
        lines: list[str] = [f"Cell mismatch in {path}:"]
        failing = [c for c in error.cells if not c.ok]  # type: ignore[union-attr]
        if not failing:
            lines.append("  (no failing cells)")
        for cell in failing:
            lines.append(
                f"  line {cell.span.start_line} | column '{cell.column}'"
                f" — expected: {cell.expected!r}, actual: {cell.actual!r}"
            )
        return "\n".join(lines)

    if isinstance(error, ReturnShapeError):
        return str(error)

    return f"{type(error).__name__}: {error}"
