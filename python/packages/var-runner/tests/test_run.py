from var_runner.steps import load_steps
from var_runner.run import plan_spec, examples_with_runs, RecordingReporter

STEPS = '''
from var import steps
param, stimulus, sensor = steps(lambda: {"n": 0})
@stimulus("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    if state["n"] != total:
        raise AssertionError(f"expected {total} got {state['n']}")
'''
SRC_PASS = "# Calc\n\n## adds\n\nI add 2\nthe total is 2\n"
SRC_FAIL = "# Calc\n\n## adds wrong\n\nI add 2\nthe total is 99\n"

def _runs(tmp_path, src):
    (tmp_path / "c.steps.py").write_text(STEPS, encoding="utf-8")
    loaded = load_steps(["**/*.steps.py"], tmp_path)
    plan = plan_spec("c.md", src, loaded.registry)
    return examples_with_runs(plan, loaded.create_context, RecordingReporter())

def test_passing_example_runs_clean(tmp_path):
    pairs = _runs(tmp_path, SRC_PASS)
    assert len(pairs) == 1
    example, run = pairs[0]
    assert example.name and run() is None     # no raise

def test_failing_example_raises(tmp_path):
    import pytest
    _example, run = _runs(tmp_path, SRC_FAIL)[0]
    with pytest.raises(Exception):
        run()
