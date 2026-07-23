from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

_KNOWN_KEYS = {"$schema", "docs", "steps", "snippets"}
_KNOWN_DOCS_KEYS = {"include", "exclude"}


@dataclass(frozen=True, slots=True)
class VarConfig:
    docs_include: tuple[str, ...] = ()
    docs_exclude: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    snippets: Mapping[str, str] = field(default_factory=dict)


def _string_tuple(value: object, key: str, path: Path) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError(f"{path}: '{key}' must be an array of strings")
    return tuple(value)


def read_varar_config(root: str | Path) -> VarConfig:
    """Read ``<root>/varar.config.json``.

    Missing file -> empty config (tools no-op; matches every other port).
    Malformed JSON, wrong types, or unknown keys -> ``ValueError`` starting
    with the file path — a typo'd config must fail loudly, never silently
    discover nothing. See conformance/config/README.md for the shared rules.
    """
    path = Path(root) / "varar.config.json"
    if not path.is_file():
        return VarConfig()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"{path}: invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top level must be an object")
    unknown = set(data) - _KNOWN_KEYS
    if unknown:
        raise ValueError(
            f"{path}: unknown key(s): {', '.join(sorted(unknown))} "
            "(known keys: docs, steps, snippets)"
        )
    docs = data.get("docs")
    if docs is None:
        docs = {}
    if not isinstance(docs, dict):
        raise ValueError(f"{path}: 'docs' must be an object")
    unknown_docs = set(docs) - _KNOWN_DOCS_KEYS
    if unknown_docs:
        raise ValueError(f"{path}: unknown docs key(s): {', '.join(sorted(unknown_docs))}")
    snippets = data.get("snippets")
    if snippets is None:
        snippets = {}
    if not isinstance(snippets, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in snippets.items()
    ):
        raise ValueError(f"{path}: 'snippets' must be an object of strings")
    return VarConfig(
        docs_include=_string_tuple(docs.get("include"), "docs.include", path),
        docs_exclude=_string_tuple(docs.get("exclude"), "docs.exclude", path),
        steps=_string_tuple(data.get("steps"), "steps", path),
        snippets=dict(snippets),
    )
