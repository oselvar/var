"""result.py — port of typescript/packages/core/src/result.ts.

Immutable dataclasses for run results (CellFailure, ExampleResult, SpecResults).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class CellFailure:
    """One mismatched CELL as a source-offset range plus the runtime value.

    ``from_`` maps to the ``from`` field in the wire format (``from`` is a Python
    keyword); ``to`` is exclusive.  Offsets are UTF-16 code units.
    """

    from_: int  # 'from' is a Python keyword — serialised as 'from' in JSON
    to: int
    actual: str


@dataclass(frozen=True, slots=True)
class ExampleFailure:
    """The failure payload inside an ExampleResult."""

    line: int
    message: str
    stack: str
    cells: tuple[CellFailure, ...] | None = None


@dataclass(frozen=True, slots=True)
class ExampleResult:
    """Run result for a single BDD example."""

    name: str
    status: Literal["passed", "failed"]
    lines: tuple[int, ...]
    failure: ExampleFailure | None = None


@dataclass(frozen=True, slots=True)
class SpecResults:
    """The persisted run result for one spec file (.var/<spec>.json)."""

    version: int  # always 1
    spec_path: str  # POSIX separators, relative to cwd
    source_hash: str  # hashSource(spec source) at run time
    examples: tuple[ExampleResult, ...]
