"""execute.py — port of var-core/src/execute.ts.

Executes an ExecutionPlan: routes stimulus/sensor step returns,
merges immutable state, compares sensor returns via the diff helpers, and
inverts expected-failure outcomes.

This module is part of the functional core — no filesystem, no network, no
globals, no time.  It DOES invoke user-supplied handler callbacks (the shell
provides them), and handlers may be sync or ``async def``.
"""
from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional

from varar_core.cell_diff import (
    CellMismatchError,
    ReturnShapeError,
    compare_row,
    compare_table,
)
from varar_core.doc_string_diff import compare_doc_string
from varar_core.failure_anchor import failure_anchor
from varar_core.param_diff import compare_params
from varar_core.plan import ExecutionPlan, PlannedStep
from varar_core.span import utf16_slice


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class UnexpectedPassError(Exception):
    """Raised when an example with expected_outcome='fail' passes unexpectedly."""

    def __init__(self, message: str = "expected the example to fail, but it passed") -> None:
        super().__init__(message)
        self.name = "UnexpectedPassError"


def is_unexpected_pass_error(e: object) -> bool:
    """Return True if *e* is an UnexpectedPassError."""
    return isinstance(e, UnexpectedPassError)


@dataclass(frozen=True)
class StepObservation:
    """Per-step outcome emitted to the optional ExecutionObserver."""

    example_name: str
    example_index: int   # 0-based index within plan.examples
    ordinal: int         # 1-based index within the example's steps
    step_file: str       # step_def.expression_source_file
    outcome: Literal["pass", "fail"]
    error: Any = field(default=None)


@dataclass
class ExecutePorts:
    """Ports that execute_plan requires from the shell."""

    sink: Any                                            # TestSink protocol
    reporter: Any                                        # Reporter protocol
    create_context: Optional[Callable[[str], Any]] = None
    observer: Optional[Any] = None                       # ExecutionObserver protocol


@dataclass
class CollectPorts:
    """Ports for collect_examples (the sink is wired internally)."""

    reporter: Any
    create_context: Optional[Callable[[str], Any]] = None
    observer: Optional[Any] = None


@dataclass(frozen=True)
class QueuedExample:
    """A named, runnable example returned by collect_examples."""

    name: str
    run: Callable[[], None]


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def collect_examples(plan: ExecutionPlan, ports: CollectPorts) -> tuple[QueuedExample, ...]:
    """Collect all examples into an ordered tuple of QueuedExamples.

    Port of collectExamples() from execute.ts.  Wires a capturing sink and
    forwards the remaining ports to execute_plan.
    """
    queue: list[QueuedExample] = []

    class _CaptureSink:
        def example(self, name: str, run: Callable, info: Any = None) -> None:
            queue.append(QueuedExample(name=name, run=run))

    execute_plan(
        plan,
        ExecutePorts(
            sink=_CaptureSink(),
            reporter=ports.reporter,
            create_context=ports.create_context,
            observer=ports.observer,
        ),
    )
    return tuple(queue)


def execute_plan(plan: ExecutionPlan, ports: ExecutePorts) -> None:
    """Execute an ExecutionPlan, routing each step through the ports.

    Port of executePlan() from execute.ts.

    - Diagnostics are forwarded through ``ports.reporter``.
    - Each example is registered with ``ports.sink.example(name, run, info)``.
    - The ``run`` callable is **synchronous**; async handlers are driven to
      completion internally via ``asyncio.run()``.
    - State is per-stepfile and deep-frozen between steps.
    - Sensor returns are compared against the Markdown; mismatches raise errors.
    - Examples with ``expected_outcome='fail'`` have their outcome inverted.
    """
    for d in plan.diagnostics:
        ports.reporter.diagnostic(d)

    _create_context: Callable[[str], Any] = (
        ports.create_context if ports.create_context is not None else lambda _: {}
    )
    var_path = plan.var_doc.path

    for example_index, ex in enumerate(plan.examples):
        # Deduplicated step lines, preserving document order.
        seen_lines: dict[int, None] = {}
        for s in ex.steps:
            seen_lines[s.match_span.start_line] = None
        info = {"lines": list(seen_lines.keys())}

        def _make_run(
            ex: Any = ex,
            example_index: int = example_index,
        ) -> Callable[[], None]:
            def run() -> None:
                # One frozen state object per stepfile, lazily created.
                state_by_file: dict[str, Any] = {}
                last_return: Any = None
                thrown: Any = None

                for i, step in enumerate(ex.steps):
                    file: str = step.step_def.expression_source_file

                    # Lazy initialisation of per-file state.
                    if file not in state_by_file:
                        ctx = _create_context(file)
                        if inspect.iscoroutine(ctx):
                            ctx = asyncio.run(ctx)
                        state_by_file[file] = ctx
                    state = state_by_file[file]

                    # Build the trailing extra arg list (data table or doc string).
                    extra: list[Any] = []
                    if step.data_table is not None:
                        # [header_cells, row1_cells, row2_cells, ...]
                        extra.append(
                            [
                                list(step.data_table.header.cells),
                                *[list(row.cells) for row in step.data_table.rows],
                            ]
                        )
                    elif step.doc_string is not None:
                        extra.append(step.doc_string.content)

                    try:
                        returned = step.step_def.handler(state, *step.args, *extra)
                        if inspect.iscoroutine(returned):
                            returned = asyncio.run(returned)
                        last_return = returned

                        kind = step.step_def.kind

                        if kind == "stimulus":
                            # Full replacement: the returned dict IS the next state.
                            # There is no merge — a return with fewer keys shrinks
                            # the state. None is a no-op; any other type is a
                            # contract violation.
                            #
                            # The state is the author's own value, handed back
                            # untouched: we do not freeze it, and a dict stays a
                            # dict rather than becoming a MappingProxyType. Whether
                            # it is immutable is the author's call.
                            if returned is not None:
                                if not isinstance(returned, dict):
                                    raise ReturnShapeError(
                                        "a stimulus must return the complete next"
                                        " state, or nothing to leave it unchanged"
                                    )
                                state = returned
                                state_by_file[file] = state

                        elif kind == "sensor":
                            # Header-bound rows skip the slot contract (they return
                            # a row object compared via compare_row after the loop).
                            if ex.row_checks is None:
                                # A sensor's comparison slots are its expression
                                # parameters followed by the trailing data table or
                                # doc string, if any. Zero slots: nothing to compare
                                # against — a returned value is a mistake (raise to
                                # fail, return nothing to pass). One slot: the return
                                # IS that slot's value (never a tuple, so a parameter
                                # type transforming to a list is compared as-is).
                                # Two or more: a positional list, one per slot.
                                #
                                # With one or more slots the return is REQUIRED:
                                # returning nothing used to skip the comparison
                                # silently, so a typo in an attribute lookup turned
                                # an assertion into a no-op. Raise to fail instead.
                                slot_count = len(step.args) + len(extra)
                                if slot_count == 0:
                                    if returned is not None:
                                        raise ReturnShapeError(
                                            "this sensor has no parameters, data table or"
                                            " doc string — nothing to compare a return"
                                            " value against (raise to fail, return"
                                            " nothing to pass)"
                                        )
                                elif returned is None:
                                    raise ReturnShapeError(
                                        f"a sensor with {slot_count} slot(s) must return"
                                        " one value per slot, got nothing"
                                    )
                                else:
                                    if slot_count == 1:
                                        slots: list[Any] = [returned]
                                    else:
                                        if not isinstance(returned, (list, tuple)):
                                            raise ReturnShapeError(
                                                f"a sensor with {slot_count} slots"
                                                f" must return a list of {slot_count}"
                                                f" values, got {type(returned).__name__}"
                                            )
                                        if len(returned) != slot_count:
                                            raise ReturnShapeError(
                                                f"sensor return must have {slot_count}"
                                                f" element(s), got {len(returned)}"
                                            )
                                        slots = list(returned)
                                    # Inline parameter comparison.
                                    inline_returned = slots[: len(step.args)]
                                    source_texts = [
                                        utf16_slice(
                                            plan.var_doc.source,
                                            s.start_offset,
                                            s.end_offset,
                                        )
                                        for s in step.param_spans
                                    ]
                                    param_diffs = [
                                        d
                                        for d in compare_params(
                                            inline_returned,
                                            list(step.args),
                                            list(step.param_spans),
                                            source_texts,
                                            list(step.formats),
                                        )
                                        if not d.ok
                                    ]
                                    if param_diffs:
                                        raise CellMismatchError(param_diffs)
                                    # Trailing table / doc string occupies the last slot.
                                    if step.data_table is not None:
                                        bad = [
                                            d
                                            for d in compare_table(
                                                slots[len(step.args)], step.data_table
                                            )
                                            if not d.ok
                                        ]
                                        if bad:
                                            raise CellMismatchError(bad)
                                    elif step.doc_string is not None:
                                        diff = compare_doc_string(
                                            slots[len(step.args)],
                                            step.doc_string.content,
                                            step.doc_string.span,
                                        )
                                        if diff is not None:
                                            raise CellMismatchError([diff])

                        else:
                            raise ReturnShapeError(f"unknown step kind: {kind}")

                    except Exception as err:
                        augmented = _augment_stack(err, step, var_path)
                        if ports.observer is not None:
                            ports.observer.step(
                                StepObservation(
                                    example_name=ex.name,
                                    example_index=example_index,
                                    ordinal=i + 1,
                                    step_file=file,
                                    outcome="fail",
                                    error=augmented,
                                )
                            )
                        thrown = augmented
                        break

                    # Step passed — notify observer.
                    if ports.observer is not None:
                        ports.observer.step(
                            StepObservation(
                                example_name=ex.name,
                                example_index=example_index,
                                ordinal=i + 1,
                                step_file=file,
                                outcome="pass",
                            )
                        )

                # Header-bound row checks (run after all steps complete).
                if thrown is None and ex.row_checks:
                    # Like a slotted sensor, a header-bound row step must answer the
                    # row it is bound to: no return means nothing was compared.
                    row_error = (
                        ReturnShapeError(
                            "a header-bound row step must return a row object with"
                            " one value per bound cell, got nothing"
                        )
                        if last_return is None
                        else None
                    )
                    bad = [d for d in compare_row(last_return, ex.row_checks) if not d.ok]
                    if row_error is not None or bad:
                        last_step: PlannedStep = ex.steps[-1]
                        augmented = _augment_stack(
                            row_error if row_error is not None else CellMismatchError(bad),
                            last_step,
                            var_path,
                        )
                        if ports.observer is not None:
                            ports.observer.step(
                                StepObservation(
                                    example_name=ex.name,
                                    example_index=example_index,
                                    ordinal=len(ex.steps),
                                    step_file=last_step.step_def.expression_source_file,
                                    outcome="fail",
                                    error=augmented,
                                )
                            )
                        thrown = augmented

                # Expected-failure inversion.
                if ex.expected_outcome == "fail":
                    if thrown is None:
                        last_step_or_none = ex.steps[-1] if ex.steps else None
                        e = UnexpectedPassError()
                        if last_step_or_none is not None:
                            raise _augment_stack(e, last_step_or_none, var_path)
                        raise e
                    if ex.expected_error_message is not None:
                        msg = str(thrown)
                        if ex.expected_error_message not in msg:
                            raise thrown
                    return  # satisfied expected-failure → resolve (pass)

                if thrown is not None:
                    raise thrown

            return run

        ports.sink.example(ex.name, _make_run(), info)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _augment_stack(err: Exception, step: PlannedStep, var_path: str) -> Exception:
    """Attach a synthetic location note pointing at the failing step in the .md.

    Mirrors augmentStack() from execute.ts — instead of injecting into a JS
    stack string, Python 3.11 ``add_note()`` appends the frame so that pytest
    and tracebacks display it.  The note mirrors the TS format::

        at <step text> (<path>:<line>:<col>)
    """
    if not isinstance(err, Exception):
        return err  # type: ignore[return-value]
    label = step.text[:60] + "…" if len(step.text) > 60 else step.text
    # Editors resolve the failure's location from this note; failure_anchor
    # decides where it points, and the conformance trace pins that same rule
    # across ports.
    anchor = failure_anchor(err, step.match_span)
    frame = f"    at {label} ({var_path}:{anchor.start_line}:{anchor.start_col})"
    err.add_note(frame)
    return err
