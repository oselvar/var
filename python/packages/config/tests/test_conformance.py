"""Config conformance: every case in conformance/config/cases must parse to
the shared golden (byte-for-byte via canonical JSON) or fail if the case has
an expect-error.txt marker. See conformance/config/README.md."""

from pathlib import Path

import pytest
from varar_core.canonical_json import canonical_stringify

from varar_config import read_varar_config

# python/packages/config/tests -> parents[4] = repo root
CASES_DIR = Path(__file__).resolve().parents[4] / "conformance" / "config" / "cases"
CASES = sorted(p for p in CASES_DIR.iterdir() if p.is_dir())


def _artifact(cfg) -> dict:
    return {
        "docs": {"include": list(cfg.docs_include), "exclude": list(cfg.docs_exclude)},
        "steps": list(cfg.steps),
        "snippets": dict(cfg.snippets),
    }


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.name)
def test_config_case(case: Path) -> None:
    if (case / "expect-error.txt").exists():
        with pytest.raises(ValueError):
            read_varar_config(case)
    else:
        actual = canonical_stringify(_artifact(read_varar_config(case)))
        expected = (case / "golden.json").read_text(encoding="utf-8")
        assert actual == expected
