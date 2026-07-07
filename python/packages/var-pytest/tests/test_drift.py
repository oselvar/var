"""Drift gate through the pytest plugin (mirrors the TS var-cli drift tests)."""
import json

STEPS = '''
from var import steps
param, stimulus, sensor = steps(lambda: {"n": 0})
@stimulus("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
'''

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""


def _project(pytester):
    (pytester.path / "var.config.json").write_text(VAR_CONFIG, encoding="utf-8")
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps/calc.steps.py").write_text(STEPS.strip(), encoding="utf-8")
    (pytester.path / "features").mkdir(exist_ok=True)


def _write_baseline(pytester, examples):
    lock = {
        "version": 1,
        "specs": {"features/vault.md": {"sourceHash": "fnv1a:0", "examples": examples}},
    }
    (pytester.path / "var.lock.json").write_text(json.dumps(lock), encoding="utf-8")


def _lock(pytester):
    return json.loads((pytester.path / "var.lock.json").read_text(encoding="utf-8"))


def test_first_run_records_the_baseline_and_passes(pytester):
    _project(pytester)
    (pytester.path / "features/calc.md").write_text("I add 2\n", encoding="utf-8")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
    lock = _lock(pytester)
    assert lock["specs"]["features/calc.md"]["examples"] == [{"name": "I add 2", "line": 1}]


def test_a_paragraph_that_stopped_matching_drifts_and_fails(pytester):
    _project(pytester)
    # Prose now; the baseline says it was an example.
    (pytester.path / "features/vault.md").write_text("The vault is sealed.\n", encoding="utf-8")
    _write_baseline(pytester, [{"name": "The vault is sealed", "line": 1}])
    before = (pytester.path / "var.lock.json").read_text(encoding="utf-8")
    result = pytester.runpytest("-v")
    result.assert_outcomes(failed=1)
    result.stdout.fnmatch_lines(["*var:drift*"])
    # Unacknowledged drift leaves the baseline untouched.
    assert (pytester.path / "var.lock.json").read_text(encoding="utf-8") == before


def test_var_update_accepts_drift(pytester):
    _project(pytester)
    (pytester.path / "features/vault.md").write_text("The vault is sealed.\n", encoding="utf-8")
    _write_baseline(pytester, [{"name": "The vault is sealed", "line": 1}])
    result = pytester.runpytest("--var-update")
    result.assert_outcomes()
    assert _lock(pytester)["specs"]["features/vault.md"]["examples"] == []
