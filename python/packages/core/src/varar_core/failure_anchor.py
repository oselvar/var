"""failure_anchor.py — where a failure points in the .md source.

Port of failureAnchor from typescript/packages/core/src/failure-anchor.ts.
A mismatch anchors at its first failing span (the cell, the doc string fence
body), anything else at the fallback — the step's match start. This rule is
the single source of truth for failure locations: the executor's stack
augmentation renders it per-runtime, and the conformance trace pins it as
``failure.anchor``, so every language port must reproduce it byte-for-byte.
"""

from __future__ import annotations

from varar_core.cell_diff import is_cell_mismatch_error
from varar_core.span import Span


def failure_anchor(error: object, fallback: Span) -> Span:
    if is_cell_mismatch_error(error):
        return next((c.span for c in error.cells if not c.ok), fallback)
    return fallback
