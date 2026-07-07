"""test_async.py — async def step handlers work through the unittest adapter.

The var core drives coroutines via asyncio.run() in execute.py, so no adapter
change is expected.  This test confirms end-to-end transparency.
"""
from __future__ import annotations

VAR_CONFIG = """\
{"docs": {"include": ["features/**/*.md"], "exclude": []},
 "steps": ["steps/**/*.steps.py"]}
"""

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


def _write(harness, spec: str) -> None:
    harness.write("var.config.json", VAR_CONFIG)
    harness.write("steps/async_calc.steps.py", ASYNC_STEPS)
    harness.write("features/async.md", spec)


def test_async_handler_example_passes(harness):
    _write(harness, ASYNC_SPEC)
    result, _output = harness.generate_and_run()
    assert result.testsRun == 1
    assert not result.failures and not result.errors


def test_async_mismatch_is_detected(harness):
    _write(harness, ASYNC_WRONG_SPEC)
    result, _output = harness.generate_and_run()
    assert len(result.failures) == 1
    (_test, message) = result.failures[0]
    assert "99" in message and "3" in message
