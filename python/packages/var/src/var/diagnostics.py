"""diagnostics.py — port of var-core/src/diagnostics.ts.

Only the subset needed by the planner is ported here:
  Severity, DiagnosticCode, Diagnostic, Candidate, AmbiguousInput,
  ambiguous_match(), error_fence_without_step().
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from var.span import Span

Severity = Literal["error", "warning"]
DiagnosticCode = Literal["ambiguous-match", "error-fence-without-step"]


@dataclass(frozen=True, slots=True)
class Candidate:
    expression: str
    source_file: str
    source_line: int


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: DiagnosticCode
    severity: Severity
    message: str
    span: Span


@dataclass(frozen=True, slots=True)
class AmbiguousInput:
    text: str
    span: Span
    candidates: tuple[Candidate, ...]


def ambiguous_match(input: AmbiguousInput) -> Diagnostic:
    """Mirror ambiguousMatch() from diagnostics.ts."""
    lines = "\n".join(
        f"  '{c.expression}'    at {c.source_file}:{c.source_line}"
        for c in input.candidates
    )
    return Diagnostic(
        severity="error",
        code="ambiguous-match",
        message=f'Ambiguous step: "{input.text}"\nMatched by:\n{lines}',
        span=input.span,
    )


def error_fence_without_step(span: Span) -> Diagnostic:
    """Mirror errorFenceWithoutStep() from diagnostics.ts."""
    return Diagnostic(
        severity="error",
        code="error-fence-without-step",
        message=(
            "This `error` fence marks the example as expected-to-fail, "
            "but the example has no step to run."
        ),
        span=span,
    )
