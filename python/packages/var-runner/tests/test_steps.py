from var_runner.steps import load_steps

STEPS = '''
from var import define_state
context, action, sensor = define_state(lambda: {"n": 0})
@action("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    return state["n"]
'''

def test_load_steps_builds_registry_and_context(tmp_path):
    (tmp_path / "calc.steps.py").write_text(STEPS, encoding="utf-8")
    loaded = load_steps(["**/*.steps.py"], tmp_path)
    exprs = [s.expression for s in loaded.registry.steps]
    assert "I add {int}" in exprs and "the total is {int}" in exprs
    # context factory yields the stepfile's fresh state
    ctx = loaded.create_context(str(tmp_path / "calc.steps.py"))
    assert ctx == {"n": 0}

def test_load_steps_resets_between_calls(tmp_path):
    (tmp_path / "a.steps.py").write_text(STEPS, encoding="utf-8")
    load_steps(["**/*.steps.py"], tmp_path)
    loaded2 = load_steps(["**/*.steps.py"], tmp_path)
    assert len(loaded2.registry.steps) == 2  # not 4 — reset cleared the first load
