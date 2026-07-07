"""test_async.py — verify that async def step handlers work through the plugin.

The var core drives coroutines via asyncio.run() in execute.py, so no plugin
change is expected.  This test confirms end-to-end transparency.
"""

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""

# An action that is async def, returns a partial state dict.
# A sensor that is async def, returns its single slot bare so the core can compare it.
ASYNC_STEPS = """\
import asyncio
from var import steps

param, stimulus, sensor = steps(lambda: {"value": 0})


@stimulus("I asynchronously add {int}")
async def _(state, n):
    await asyncio.sleep(0)   # yield to event loop once
    return {"value": state["value"] + n}


@sensor("the async total is {int}")
async def _(state, expected):
    await asyncio.sleep(0)
    return state["value"]
"""

ASYNC_SPEC = """\
# Async feature

## adds two values asynchronously

I asynchronously add 3
I asynchronously add 4
the async total is 7
"""

ASYNC_WRONG_SPEC = """\
# Async feature

## async mismatch is detected

I asynchronously add 3
the async total is 99
"""


def _write_fixture(pytester, spec_content: str, steps_content: str) -> None:
    (pytester.path / "var.config.json").write_text(VAR_CONFIG, encoding="utf-8")
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps" / "async_calc.steps.py").write_text(
        steps_content.strip(), encoding="utf-8"
    )
    (pytester.path / "features").mkdir(exist_ok=True)
    (pytester.path / "features" / "async.md").write_text(spec_content, encoding="utf-8")


def test_async_handler_example_passes(pytester):
    """An async def action and async def sensor are driven to completion by the core."""
    _write_fixture(pytester, ASYNC_SPEC, ASYNC_STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
    result.stdout.fnmatch_lines(["*async*PASSED*"])


def test_async_mismatch_is_detected(pytester):
    """A mismatch in an async sensor is still caught and reported as a failure."""
    _write_fixture(pytester, ASYNC_WRONG_SPEC, ASYNC_STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(failed=1)
    # render_failure emits "expected: 99, actual: 3" — confirm it's a real cell-mismatch.
    result.stdout.fnmatch_lines(["*expected*99*"])
