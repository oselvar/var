"""Author-facing API for declaring step state — port of var/src/internal.ts (defineState)."""
from __future__ import annotations

import sys
from re import Pattern
from typing import Any, Callable, Optional

from var_core.registry import Registry, add_step, create_registry, define_parameter_type
from var_core.step_role import StepKind

# ---------------------------------------------------------------------------
# Module-level mutable builder state (mirrors the module-scope vars in internal.ts)
# ---------------------------------------------------------------------------

_steps: list[dict[str, Any]] = []
# One factory per step-file; keyed by the FACTORY's __code__.co_filename
_context_factories_by_file: dict[str, Callable[[], Any]] = {}
_custom_types: list[dict[str, Any]] = []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def define_state(
    factory: Optional[Callable[[], Any]] = None,
    param_types: Optional[dict[str, dict[str, Any]]] = None,
) -> tuple[
    Callable[[str], Callable[[Callable], Callable]],
    Callable[[str], Callable[[Callable], Callable]],
]:
    """Register *factory* as the context-state constructor for its step file.

    *factory* is optional: a step file whose steps are pure (nothing to
    arrange, nothing to evolve) calls ``define_state()`` bare and its handlers
    receive an empty ``dict`` as state.

    Returns ``(stimulus, sensor)`` — each is a decorator factory:
    ``@stimulus("expression")`` registers the decorated function as a step.

    Source location is captured from the decorated function's ``__code__``
    attributes (``co_filename`` / ``co_firstlineno``).

    Raises ``RuntimeError`` if called more than once for the same source file
    (keyed by *factory*'s ``co_filename``, or the caller's file when *factory*
    is omitted), mirroring ``internal.ts``.
    """
    if factory is None:
        # No factory code object to key by — use the calling step file itself,
        # which is where an inline factory would have been defined anyway.
        source_file: str = sys._getframe(1).f_code.co_filename
        factory = dict
    else:
        source_file = factory.__code__.co_filename
    if source_file in _context_factories_by_file:
        raise RuntimeError(
            f"defineState() called more than once in {source_file}"
        )
    _context_factories_by_file[source_file] = factory

    if param_types:
        for name, defn in param_types.items():
            _custom_types.append(
                {
                    "name": name,
                    "regexp": defn["regexp"],
                    "transformer": defn.get("transformer"),
                }
            )

    def _make_decorator(kind: StepKind) -> Callable[[str], Callable[[Callable], Callable]]:
        def decorator_factory(expression: str) -> Callable[[Callable], Callable]:
            def decorator(fn: Callable) -> Callable:
                _steps.append(
                    {
                        "expression": expression,
                        "source_file": fn.__code__.co_filename,
                        "source_line": fn.__code__.co_firstlineno,
                        "handler": fn,
                        "kind": kind,
                    }
                )
                return fn

            return decorator

        return decorator_factory

    return _make_decorator("stimulus"), _make_decorator("sensor")


def context_factory() -> Callable[[str], Any]:
    """Return a callable ``(step_file: str) -> state`` that invokes the
    registered factory for *step_file*, or ``{}`` if none is registered.

    Mirrors ``contextFactory()`` in ``internal.ts``.
    """
    # Snapshot at call time (mirrors TS semantics where the map is closed over)
    factories = dict(_context_factories_by_file)

    def _invoke(step_file: str) -> Any:
        f = factories.get(step_file)
        return f() if f is not None else {}

    return _invoke


def build_registry() -> Registry:
    """Build and return a ``Registry`` from the accumulated steps and custom types.

    Mirrors ``buildRegistry()`` in ``internal.ts``: custom parameter types are
    registered first, then steps are compiled in registration order.
    """
    r = create_registry()
    for t in _custom_types:
        kwargs: dict[str, Any] = {"name": t["name"], "regexp": t["regexp"]}
        if t.get("transformer") is not None:
            kwargs["transformer"] = t["transformer"]
        r = define_parameter_type(r, **kwargs)
    for e in _steps:
        r = add_step(
            r,
            expression=e["expression"],
            expression_source_file=e["source_file"],
            expression_source_line=e["source_line"],
            handler=e["handler"],
            kind=e["kind"],
        )
    return r


def _reset_builder() -> None:
    """Clear all accumulated state.  Use in tests between isolated scenarios."""
    global _steps, _custom_types
    _steps = []
    _context_factories_by_file.clear()
    _custom_types = []


def _custom_parameter_types() -> list[dict[str, str]]:
    """Conformance-harness accessor: the custom parameter types accumulated by
    ``define_state`` since the last ``_reset_builder``, projected to the
    ``{"name", "regexp"}`` wire shape ``to_registry_artifact`` serializes.

    ``regexp`` is the bare pattern source (``re.Pattern.pattern`` or the string
    as authored — no flags/delimiters), the cross-port convention every
    language's registry golden uses. Internal-only, mirrors the TS
    ``_customParameterTypes``.
    """
    out: list[dict[str, str]] = []
    for t in _custom_types:
        rx = t["regexp"]
        if isinstance(rx, Pattern):
            rx = rx.pattern
        elif not isinstance(rx, str):
            raise TypeError(
                f"parameter type {t['name']!r}: regexp lists are not supported by the "
                "conformance projection yet"
            )
        out.append({"name": t["name"], "regexp": rx})
    return out
