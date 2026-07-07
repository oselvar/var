"""hash.py — port of typescript/packages/var-core/src/hash.ts.

FNV-1a (32-bit) change-detector over UTF-16 code units. Not a security hash:
tiny, dependency-free, and byte-identical to the TypeScript (and future JVM)
implementations so ``var.lock.json`` fingerprints match across every port. The
``fnv1a:`` prefix namespaces the algorithm.
"""
from __future__ import annotations

_FNV_OFFSET = 0x811C9DC5
_FNV_PRIME = 0x01000193
_MASK = 0xFFFFFFFF


def hash_source(source: str) -> str:
    """Mirror hashSource() from hash.ts, hashing over UTF-16 code units."""
    h = _FNV_OFFSET
    data = source.encode("utf-16-le")
    for i in range(0, len(data), 2):
        unit = data[i] | (data[i + 1] << 8)
        h = ((h ^ unit) * _FNV_PRIME) & _MASK
    return f"fnv1a:{h:08x}"
