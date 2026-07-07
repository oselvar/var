"""test_fixtures.py — pytester-based tests for the fixture bridge.

Tests:
- A step handler can receive pytest fixtures (``db``, ``tmp_path``) via extra
  parameters after the captured args; the captured ``{int}`` is still bound
  positionally, not confused with fixtures.
- Classification pins: one handler has BOTH a captured arg AND a fixture,
  asserting that the bridge correctly separates positional captures from
  fixture injections.
"""

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""

# ---------------------------------------------------------------------------
# Steps: action uses db + tmp_path fixtures; sensor uses db fixture only.
# The {int} capture is the positional arg; db and tmp_path are fixtures.
# ---------------------------------------------------------------------------

STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {})

@stimulus("I save {int}")
def _(state, n, db, tmp_path):
    db.append((n, str(tmp_path)))

@sensor("db has {int} entries")
def _(state, count, db):
    return len(db)
"""

SPEC = """\
# Fixture Bridge

## saves to db and tmp_path

I save 1
I save 2
db has 2 entries
"""

def _write_fixture(pytester, spec_content: str, steps_content: str) -> None:
    (pytester.path / "var.config.json").write_text(VAR_CONFIG, encoding="utf-8")
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps" / "spec.steps.py").write_text(
        steps_content.strip(), encoding="utf-8"
    )
    (pytester.path / "features").mkdir(exist_ok=True)
    (pytester.path / "features" / "spec.md").write_text(spec_content, encoding="utf-8")


# Also create a conftest with a custom db fixture
CONFTEST = """\
import pytest

@pytest.fixture
def db():
    return []
"""


def test_fixtures_injected_into_step_handlers(pytester):
    """db and tmp_path fixtures are injected; {int} capture stays positional."""
    pytester.makeconftest(CONFTEST)
    _write_fixture(pytester, SPEC, STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


# ---------------------------------------------------------------------------
# Classification pin: one handler with BOTH a captured arg AND a fixture.
# ``n`` is positional (from {int}), ``db`` is a fixture.
# ---------------------------------------------------------------------------

CLASSIFICATION_STEPS = """\
from var import steps
param, stimulus, sensor = steps(lambda: {})

@stimulus("I store {int} in db")
def _(state, n, db):
    db.append(n)

@sensor("db contains {int}")
def _(state, expected, db):
    assert db == [expected], f"expected [{expected}], got {db}"
    return expected
"""

CLASSIFICATION_SPEC = """\
# Classification

## captured arg and fixture coexist

I store 42 in db
db contains 42
"""


def test_classification_captured_and_fixture(pytester):
    """n is bound from {int} capture; db is injected as fixture — they coexist."""
    pytester.makeconftest(CONFTEST)
    _write_fixture(pytester, CLASSIFICATION_SPEC, CLASSIFICATION_STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
