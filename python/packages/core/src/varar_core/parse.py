"""parse.py — port of typescript/packages/core/src/parse.ts.

Combines scan + structure into the top-level parse function.
"""

from __future__ import annotations

from varar_core.ast import VarDoc
from varar_core.scanner import scan
from varar_core.structurer import structure


def parse(path: str, source: str) -> VarDoc:
    """Parse *source* into a VarDoc: scan blocks then group them into Examples."""
    return structure(path, source, scan(source))
