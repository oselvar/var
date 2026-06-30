"""fixtures.py — pytest fixture bridge for var-pytest.

Provides:
- ``_active_request``: a ContextVar holding the current ``FixtureRequest``.
- ``get_active_request()``: retrieves it (raises RuntimeError if unset).
- ``wrap_registry_for_fixtures(registry, get_request) -> Registry``: returns a
  new Registry whose step handlers resolve fixture parameters dynamically via
  ``get_request().getfixturevalue(name)``.
"""
from __future__ import annotations

import inspect
from contextvars import ContextVar
from dataclasses import replace
from typing import Any, Callable

from var.registry import Registry

# ---------------------------------------------------------------------------
# Per-item active request contextvar
# ---------------------------------------------------------------------------

_active_request: ContextVar[Any] = ContextVar("_active_request")


def get_active_request() -> Any:
    """Return the FixtureRequest for the currently-running VarItem.

    Raises RuntimeError if called outside a VarItem runtest.
    """
    try:
        return _active_request.get()
    except LookupError as exc:
        raise RuntimeError(
            "No active pytest fixture request — "
            "are you calling a fixture-using step outside a VarItem.runtest?"
        ) from exc


# ---------------------------------------------------------------------------
# Fixture parameter classification
# ---------------------------------------------------------------------------


def _fixture_param_names(fn: Callable[..., Any], n_positional_passed: int) -> list[str]:
    """Return the names of parameters that should be resolved as fixtures.

    Parameters AFTER the first ``1 + n_positional_passed`` positional params
    (i.e. after ``state`` plus the args the core passes) that are
    ``POSITIONAL_OR_KEYWORD`` or ``KEYWORD_ONLY`` are treated as fixture names.
    """
    params = list(inspect.signature(fn).parameters.values())
    tail = params[1 + n_positional_passed :]
    return [
        p.name
        for p in tail
        if p.kind in (p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)
    ]


# ---------------------------------------------------------------------------
# Handler wrapper
# ---------------------------------------------------------------------------


def _wrap_handler(
    original: Callable[..., Any],
    get_request: Callable[[], Any],
) -> Callable[..., Any]:
    """Return a wrapper that resolves fixture params and delegates to *original*.

    The wrapper is called as ``(state, *args)`` where ``args`` are the
    positional captures (and an optional trailing table/doc-string) passed by
    the core.  Fixture parameters are classified at call time so that a
    trailing table/doc-string arg is counted as a positional capture and NOT
    mistakenly treated as a fixture name.
    """

    def wrapper(state: Any, *args: Any) -> Any:
        names = _fixture_param_names(original, len(args))
        if not names:
            return original(state, *args)
        request = get_request()
        resolved = {name: request.getfixturevalue(name) for name in names}
        return original(state, *args, **resolved)

    return wrapper


# ---------------------------------------------------------------------------
# Registry wrapper
# ---------------------------------------------------------------------------


def wrap_registry_for_fixtures(
    registry: Registry,
    get_request: Callable[[], Any],
) -> Registry:
    """Return a new Registry whose every step handler resolves fixture params.

    Each ``StepRegistration`` in the returned registry has its ``handler``
    replaced by a wrapper that calls ``get_request().getfixturevalue(name)``
    for each parameter that appears after the positional captures in the
    original handler's signature.
    """
    wrapped_steps = tuple(
        replace(step, handler=_wrap_handler(step.handler, get_request))
        for step in registry.steps
    )
    return replace(registry, steps=wrapped_steps)
