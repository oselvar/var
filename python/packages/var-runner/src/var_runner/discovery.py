from __future__ import annotations

import os
import re
from collections.abc import Sequence
from pathlib import Path


def _abs_no_deref(path: Path) -> Path:
    # os.path.abspath normalizes (cwd-joins, collapses ..) WITHOUT dereferencing
    # symlinks — a symlinked spec must match the docs globs by its apparent path,
    # not its target's (mirrors Java's toAbsolutePath().normalize()).
    return Path(os.path.abspath(path))


def _rel_posix(path: Path, root: Path) -> str:
    # walk_up=True (Python 3.12+) yields a ``../`` prefix when *path* is outside
    # *root*, so specs can live outside the config root (e.g. a shared corpus in a
    # sibling directory) and still match a ``../sibling/**`` glob.
    return _abs_no_deref(path).relative_to(_abs_no_deref(root), walk_up=True).as_posix()


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Translate a glob pattern with **, *, ? to a compiled regex.

    Semantics (same as ``pathlib.Path.full_match`` / PEP 428):
    - ``/**/`` (slash–doublestar–slash) → ``/(?:.+/)?``  zero or more intermediate
      directory segments (the surrounding slashes are absorbed into the token).
    - ``/**`` at end of pattern → ``(?:/.*)?``  optional trailing path.
    - ``**/`` not preceded by ``/`` (leading or after a literal) → ``(?:.*/)?``
      zero or more path segments including the trailing slash, so a leading ``**/``
      matches both root-level paths and nested ones.
    - bare ``**`` elsewhere → ``.*``.
    - ``*``  → ``[^/]*``  (any chars except ``/``).
    - ``?``  → ``[^/]``   (single char except ``/``).

    ``pathlib.Path.full_match`` (Python 3.13+) would express this natively,
    but Python 3.12 does not have it, so we compile a regex instead.
    """
    result = ""
    i = 0
    n = len(pattern)
    while i < n:
        c = pattern[i]
        if c == "/" and pattern[i : i + 4] == "/**/":
            # /**/ → /(?:.+/)?  — absorb both slashes; zero or more intermediate dirs
            result += "/(?:.+/)?"
            i += 4
        elif c == "/" and pattern[i : i + 3] == "/**" and i + 3 == n:
            # /** at end → optional trailing /anything
            result += "(?:/.*)?"
            i += 3
        elif c == "*" and pattern[i : i + 3] == "**/":
            # **/ not preceded by /  (leading **/ or after a literal char)
            # → zero or more path segments with their trailing slash (optional)
            result += "(?:.*/)?"
            i += 3
        elif c == "*" and pattern[i : i + 2] == "**":
            # bare ** (e.g. at end of pattern with no following /)
            result += ".*"
            i += 2
        elif c == "*":
            result += "[^/]*"
            i += 1
        elif c == "?":
            result += "[^/]"
            i += 1
        else:
            result += re.escape(c)
            i += 1
    return re.compile(result)


def _matches_any(rel: str, globs: Sequence[str]) -> bool:
    return any(_glob_to_regex(g).fullmatch(rel) is not None for g in globs)


def match_spec(
    path: Path,
    include: Sequence[str],
    exclude: Sequence[str],
    root: Path,
) -> bool:
    """Return True iff *path* matches an include glob and no exclude glob."""
    rel = _rel_posix(path, root)
    return _matches_any(rel, include) and not _matches_any(rel, exclude)


def find_specs(
    include: Sequence[str],
    exclude: Sequence[str],
    root: Path,
) -> tuple[Path, ...]:
    """Return existing files under *root* matching any include glob, minus any exclude; sorted."""
    out: set[Path] = set()
    for g in include:
        out.update(p for p in root.glob(g) if p.is_file())
    keep = [p for p in out if not _matches_any(_rel_posix(p, root), exclude)]
    return tuple(sorted(keep))
