STEPS = '''
from var import define_state
context, action, sensor = define_state(lambda: {"n": 0})
@action("I add {int}")
def _(state, n):
    return {"n": state["n"] + n}
@sensor("the total is {int}")
def _(state, total):
    assert state["n"] == total, f"expected {total} got {state['n']}"
'''
VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""
# Steps must be in the same paragraph (single newline, not blank line) so the
# structurer groups them into one example per ## section.
SPEC = "# Calc\n\n## adds two\n\nI add 2\nthe total is 2\n\n## adds wrong\n\nI add 2\nthe total is 9\n"


def _write_var_config(pytester):
    (pytester.path / "var.config.json").write_text(VAR_CONFIG, encoding="utf-8")


def _write_steps(pytester):
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps/calc.steps.py").write_text(STEPS.strip(), encoding="utf-8")


def test_one_item_per_example_pass_and_fail(pytester):
    _write_var_config(pytester)
    _write_steps(pytester)
    (pytester.path / "features").mkdir()
    (pytester.path / "features/calc.md").write_text(SPEC, encoding="utf-8")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1, failed=1)
    result.stdout.fnmatch_lines(["*features/calc.md::adds two*PASSED*"])


def test_k_selection(pytester):
    _write_var_config(pytester)
    _write_steps(pytester)
    (pytester.path / "features").mkdir()
    (pytester.path / "features/calc.md").write_text(SPEC, encoding="utf-8")
    # pytest 9 uses expression syntax; "adds and two" matches items whose
    # keywords include both "adds" and "two" — uniquely identifies "adds two".
    result = pytester.runpytest("-k", "adds and two")
    result.assert_outcomes(passed=1)


def test_duplicate_heading_items_get_unique_node_ids(pytester):
    """Two blank-line-separated paragraphs under the same ## heading must not
    produce colliding pytest node IDs.  First paragraph passes, second fails."""
    # Two paragraphs under the same heading — the structurer emits two examples
    # with identical scope_stack[-1] ("same heading").
    spec = (
        "# Calc\n\n"
        "## same heading\n\n"
        "I add 2\nthe total is 2\n\n"
        "## same heading\n\n"
        "I add 2\nthe total is 9\n"
    )
    _write_var_config(pytester)
    _write_steps(pytester)
    (pytester.path / "features").mkdir()
    (pytester.path / "features/dup.md").write_text(spec, encoding="utf-8")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1, failed=1)
    # First example keeps the bare heading; second gets the [1] suffix.
    result.stdout.fnmatch_lines(["*features/dup.md::same heading*"])
    result.stdout.fnmatch_lines(["*features/dup.md::same heading[[]1[]]*"])


def test_non_matching_md_is_ignored(pytester):
    _write_var_config(pytester)
    (pytester.path / "README.md").write_text("# not a spec\n", encoding="utf-8")
    result = pytester.runpytest()
    result.assert_outcomes()  # nothing collected, no error
