"""param_diff.py — port of typescript/packages/core/src/param-diff.ts.

Compare a sensor's returned inline actuals against captured document values.
"""
from __future__ import annotations

from typing import Any, Optional, Sequence

from varar_core.cell_diff import CellDiff, render_cell_value
from varar_core.registry import ParameterFormat
from varar_core.span import Span


def _render_param_value(value: Any, format: Optional[ParameterFormat]) -> tuple[str, bool]:
    """Render one side of a parameter diff as ``(text, via_format)``.

    The parameter type's ``format`` wins when it has one (document notation —
    the only rendering conformance can pin), then the shared
    string/primitive/repr chain.  A raising formatter falls through rather
    than masking the real mismatch.
    """
    if format is not None:
        try:
            return format(value), True
        except Exception:
            pass
    return render_cell_value(value), False


def compare_params(
    returned: Sequence[Any],
    expected: Sequence[Any],
    param_spans: Sequence[Span],
    source_texts: Sequence[str],
    formats: Optional[Sequence[Optional[ParameterFormat]]] = None,
) -> tuple[CellDiff, ...]:
    """Compare returned actuals against expected values captured from the document.

    ``expected``, ``param_spans``, and ``source_texts`` align 1:1 with ``returned``;
    the caller validates length first.  Structural equality (Python ``==``) is used
    so objects compare by value across references.  ``formats`` carries each
    parameter type's display formatter (or None), used only to render displays.
    """
    diffs: list[CellDiff] = []
    for i in range(len(expected)):
        ok = returned[i] == expected[i]
        format = formats[i] if formats is not None and i < len(formats) else None
        actual_text, via_format = _render_param_value(returned[i], format)
        diffs.append(
            CellDiff(
                column=f"cell {i + 1}",
                span=param_spans[i],
                expected=(
                    source_texts[i]
                    if i < len(source_texts)
                    else _render_param_value(expected[i], format)[0]
                ),
                actual=actual_text,
                ok=ok,
                expected_value=expected[i],
                actual_value=returned[i],
                formatted=via_format,
            )
        )
    return tuple(diffs)
