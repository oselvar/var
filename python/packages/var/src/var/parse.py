"""parse.py — port of typescript/packages/var-core/src/parse.ts.

Combines scan + structure into the top-level parse function.
"""

from __future__ import annotations

from var.ast import VarDoc
from var.scanner import ScannerPlugin, scan
from var.structurer import structure


def parse(
    path: str,
    source: str,
    plugins: tuple[ScannerPlugin, ...] = (),
) -> VarDoc:
    """Parse *source* into a VarDoc: scan blocks then group them into Examples."""
    return structure(path, source, scan(source, plugins))
