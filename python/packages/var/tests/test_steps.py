"""Tests for internal.py steps() — translated from var/src/internal.ts tests."""
from __future__ import annotations

import pytest

from var.registry import _reset_builder, build_registry, context_factory
from var import steps


def test_two_decorators_register_with_correct_kinds() -> None:
    _reset_builder()

    def factory():
        return {}

    _param, stimulus, sensor = steps(factory)

    @stimulus("I have set up the world")
    def setup(state):
        pass

    @stimulus("I do something")
    def do_something(state):
        pass

    @sensor("I check the result")
    def check(state):
        pass

    r = build_registry()
    assert len(r.steps) == 3
    kinds = {s.expression: s.kind for s in r.steps}
    assert kinds["I have set up the world"] == "stimulus"
    assert kinds["I do something"] == "stimulus"
    assert kinds["I check the result"] == "sensor"


def test_decorators_capture_source_file_and_line() -> None:
    _reset_builder()

    def factory():
        return {}

    _param, stimulus, _sensor = steps(factory)

    @stimulus("a step")
    def my_step(state):
        pass

    r = build_registry()
    step = r.steps[0]
    assert step.expression_source_line >= 1
    assert "test_steps" in step.expression_source_file


def test_second_steps_in_same_module_raises() -> None:
    _reset_builder()

    def factory1():
        return {}

    def factory2():
        return {}

    steps(factory1)
    with pytest.raises(Exception, match=r"steps.*called more than once"):
        steps(factory2)


def test_build_registry_returns_steps_in_registration_order() -> None:
    _reset_builder()

    def factory():
        return {}

    _param, stimulus, sensor = steps(factory)

    @stimulus("step one")
    def s1(state):
        pass

    @stimulus("step two")
    def s2(state):
        pass

    @sensor("step three")
    def s3(state):
        pass

    r = build_registry()
    assert [s.expression for s in r.steps] == ["step one", "step two", "step three"]


def test_context_factory_returns_callable_that_invokes_registered_factory() -> None:
    _reset_builder()

    def factory():
        return {"count": 42}

    _param, stimulus, _sensor = steps(factory)

    @stimulus("some step")
    def step(state):
        pass

    r = build_registry()
    # context_factory() returns a callable(step_file) -> state
    cf = context_factory()
    step_file = r.steps[0].expression_source_file
    state = cf(step_file)
    assert state == {"count": 42}


def test_context_factory_returns_empty_dict_for_unknown_file() -> None:
    _reset_builder()

    cf = context_factory()
    result = cf("nonexistent_file.py")
    assert result == {}


def test_steps_without_factory_registers_steps_against_empty_state() -> None:
    _reset_builder()

    _param, stimulus, sensor = steps()

    @stimulus("I warm up my mental math")
    def warm_up(state):
        pass

    @sensor("the square of {int} is {int}")
    def square(state, n, expected):
        return [n, n * n]

    r = build_registry()
    assert len(r.steps) == 2
    # The factory is keyed by THIS file (the caller), and produces a fresh {}.
    cf = context_factory()
    state = cf(r.steps[0].expression_source_file)
    assert state == {}
    assert cf(r.steps[0].expression_source_file) is not state


def test_steps_without_factory_still_enforces_once_per_file() -> None:
    _reset_builder()

    steps()
    with pytest.raises(Exception, match=r"steps.*called more than once"):
        steps()
