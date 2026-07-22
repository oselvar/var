"""test_execute.py — port of execute.test.ts, execute-state.test.ts, execute-roles.test.ts."""
from __future__ import annotations

from typing import Any

import pytest

from varar_core.cell_diff import ReturnShapeError, is_cell_mismatch_error
from varar_core.execute import (
    ExecutePorts,
    StepObservation,
    UnexpectedPassError,
    execute_plan,
)
from varar_core.parse import parse
from varar_core.plan import plan
from varar_core.registry import Registry, add_step, create_registry, define_parameter_type


# ---------------------------------------------------------------------------
# Helpers shared across test modules
# ---------------------------------------------------------------------------


def _noop_reporter() -> Any:
    class _R:
        def diagnostic(self, d: Any) -> None:
            pass

    return _R()


def _make_sink(runs: list) -> Any:
    """A sink that appends (name, run) pairs to *runs*."""

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            runs.append((name, run))

    return _S()


def _make_name_sink(names: list) -> Any:
    """A sink that appends example names to *names*."""

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            names.append(name)

    return _S()


def _capture_run(p: Any, observer: Any = None) -> Any:
    """Call execute_plan and return the sole run callable."""
    captured: list[Any] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            captured.append(run)

    ports = ExecutePorts(
        sink=_S(),
        reporter=_noop_reporter(),
        **({"observer": observer} if observer is not None else {}),
    )
    execute_plan(p, ports)
    return captured[0] if captured else None


# ---------------------------------------------------------------------------
# execute.test.ts — core behaviour
# ---------------------------------------------------------------------------


def test_execute_plan_calls_sink_example_for_each_planned_example() -> None:
    """executePlan calls sink.example for each PlannedExample."""
    r = add_step(
        create_registry(),
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    p = plan(parse("e.md", "# A\n\nGiven I have 5 cukes\n\n# B\n\nGiven I have 9 cukes"), r)
    names: list[str] = []
    execute_plan(p, ExecutePorts(sink=_make_name_sink(names), reporter=_noop_reporter()))
    assert names == ["Given I have 5 cukes", "Given I have 9 cukes"]


def test_execute_plan_reports_all_diagnostics_through_reporter() -> None:
    """executePlan reports all diagnostics through reporter.diagnostic."""
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    r = add_step(
        r,
        expression="I have 5 cukes",
        expression_source_file="s.ts",
        expression_source_line=2,
        kind="stimulus",
        handler=lambda *_: None,
    )
    p = plan(parse("m.md", "# A\n\nGiven I have 5 cukes"), r)
    got: list[Any] = []

    class _R:
        def diagnostic(self, d: Any) -> None:
            got.append(d)

    execute_plan(
        p,
        ExecutePorts(sink=type("S", (), {"example": lambda *_: None})(), reporter=_R()),
    )
    assert len(got) == 1
    assert got[0].code == "ambiguous-match"


def test_sink_example_run_callback_executes_step_handlers_in_order() -> None:
    """The sink.example run callback executes step handlers in order."""
    calls: list[str] = []
    r = add_step(
        add_step(
            create_registry(),
            expression="I add {int}",
            expression_source_file="s.ts",
            expression_source_line=1,
            kind="stimulus",
            handler=lambda _ctx, n: calls.append(f"add:{n}"),
        ),
        expression="I should have {int}",
        expression_source_file="s.ts",
        expression_source_line=2,
        kind="sensor",
        handler=lambda _ctx, n: (calls.append(f"check:{n}"), n)[1],
    )
    p = plan(parse("e.md", "# Adding\n\nI add 5. I should have 5."), r)
    run = _capture_run(p)
    run()
    assert calls == ["add:5", "check:5"]


def test_execute_plan_augments_thrown_error_with_md_frame() -> None:
    """executePlan attaches a .md location note to a thrown error."""

    def _thrower(*_: Any) -> None:
        raise RuntimeError("boom")

    r2 = add_step(
        create_registry(),
        expression="I throw",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=_thrower,
    )
    p = plan(parse("e.md", "# A\n\nI throw"), r2)
    run = _capture_run(p)
    captured: list[Exception] = []
    try:
        run()
    except Exception as e:
        captured.append(e)
    assert len(captured) == 1
    err = captured[0]
    assert "boom" in str(err)
    notes = getattr(err, "__notes__", [])
    assert any("e.md:3:1" in note for note in notes)
    assert any("I throw" in note for note in notes)


def test_execute_plan_invokes_create_context_once_per_example() -> None:
    """executePlan invokes createContext once per example and threads result to handlers."""
    ctx_seen: list[Any] = []
    r = add_step(
        create_registry(),
        expression="I record ctx",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda ctx: ctx_seen.append(ctx),
    )
    p = plan(parse("e.md", "# A\n\nI record ctx\n\n# B\n\nI record ctx"), r)
    calls = [0]
    runs: list[Any] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            runs.append(run)

    def _create_ctx(_file: str) -> dict:
        calls[0] += 1
        return {"greeting": "", "n": calls[0]}

    execute_plan(
        p,
        ExecutePorts(sink=_S(), reporter=_noop_reporter(), create_context=_create_ctx),
    )
    for run in runs:
        run()
    assert calls[0] == 2
    assert dict(ctx_seen[0]) == {"greeting": "", "n": 1}
    assert dict(ctx_seen[1]) == {"greeting": "", "n": 2}


def test_execute_plan_appends_data_table_as_last_handler_arg() -> None:
    """executePlan appends a data table as the last handler arg (after cucumber args)."""
    captured: list[Any] = []
    r = add_step(
        create_registry(),
        expression="these books exist:",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda _ctx, *args: captured.extend([args]),
    )
    source = (
        "# Library\n\nthese books exist:\n\n"
        "| title  | author  |\n|--------|---------|"
        "\n| Lolita | Nabokov |\n| Anna   | Tolstoy |\n"
    )
    p = plan(parse("l.md", source), r)
    run = _capture_run(p)
    run()
    assert len(captured) == 1
    assert list(captured[0]) == [
        [
            ["title", "author"],
            ["Lolita", "Nabokov"],
            ["Anna", "Tolstoy"],
        ]
    ]


def test_execute_plan_appends_docstring_as_last_handler_arg() -> None:
    """executePlan appends a docstring as the last handler arg."""
    captured: list[Any] = []
    r = add_step(
        create_registry(),
        expression="the receipt is:",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda _ctx, *args: captured.extend([args]),
    )
    source = '# Library\n\nthe receipt is:\n\n```json\n{"ok": true}\n```\n'
    p = plan(parse("l.md", source), r)
    run = _capture_run(p)
    run()
    assert list(captured[0]) == ['{"ok": true}\n']


def test_execute_plan_runs_header_bound_table_once_per_row() -> None:
    """executePlan runs a header-bound table once per row, passing the row object."""
    rows: list[Any] = []
    r = add_step(
        create_registry(),
        expression="each row lists the dice, the category and the score",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=lambda _ctx, *args: (rows.append(args[-1]), args[-1])[1],
    )
    source = (
        "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |\n"
        "| 3, 3, 3, 3, 3 | Yahtzee    | 50    |"
    )
    p = plan(parse("y.md", source), r)
    named: list[Any] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            named.append({"name": name, "run": run})

    execute_plan(p, ExecutePorts(sink=_S(), reporter=_noop_reporter()))
    assert [e["name"] for e in named] == [
        "3, 3, 3, 4, 4 / full house / 17",
        "3, 3, 3, 3, 3 / Yahtzee / 50",
    ]
    for e in named:
        e["run"]()
    assert rows == [
        {"dice": "3, 3, 3, 4, 4", "category": "full house", "score": "17"},
        {"dice": "3, 3, 3, 3, 3", "category": "Yahtzee", "score": "50"},
    ]


def test_failing_header_bound_row_points_stack_frame_at_row_line() -> None:
    """A failing header-bound row points the location note at that row's line."""

    def _handler(_ctx: Any, row: dict) -> dict:
        if row["score"] == "50":
            raise RuntimeError("boom")
        return row

    r = add_step(
        create_registry(),
        expression="each row lists the dice, the category and the score",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=_handler,
    )
    source = (
        "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |\n"
        "| 3, 3, 3, 3, 3 | Yahtzee    | 50    |"
    )
    p = plan(parse("y.md", source), r)
    runs: list[Any] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            runs.append(run)

    execute_plan(p, ExecutePorts(sink=_S(), reporter=_noop_reporter()))
    runs[0]()  # row on line 7 passes
    err: Exception | None = None
    try:
        runs[1]()  # row on line 8 throws
    except Exception as e:
        err = e
    assert err is not None
    notes = getattr(err, "__notes__", [])
    assert any("y.md:8:" in note for note in notes)


def test_returning_header_bound_row_mismatch_raises_cell_mismatch_error() -> None:
    """A returning header-bound row that mismatches throws CellMismatchError."""

    def _handler(_ctx: Any, row: dict) -> dict:
        score_val = int(row["score"])
        return {"score": 999 if score_val == 50 else score_val}

    r = add_step(
        create_registry(),
        expression="each row lists the dice, the category and the score",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=_handler,
    )
    source = (
        "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |\n"
        "| 3, 3, 3, 3, 3 | Yahtzee    | 50    |"
    )
    p = plan(parse("y.md", source), r)
    runs: list[Any] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            runs.append(run)

    execute_plan(p, ExecutePorts(sink=_S(), reporter=_noop_reporter()))
    runs[0]()  # 17 matches → passes
    caught: Any = None
    try:
        runs[1]()  # returns 999, cell says 50 → mismatch
    except Exception as e:
        caught = e
    assert is_cell_mismatch_error(caught)
    cells = caught.cells
    assert len(cells) == 1
    assert cells[0].column == "score"
    assert cells[0].expected == "50"
    assert cells[0].actual == "999"
    # span points at the '50' cell text in the source
    assert source[cells[0].span.start_offset : cells[0].span.end_offset] == "50"


def test_returning_header_bound_row_that_matches_passes() -> None:
    """A returning header-bound row that matches passes."""

    def _handler(_ctx: Any, row: dict) -> dict:
        return {"score": int(row["score"])}

    r = add_step(
        create_registry(),
        expression="each row lists the dice, the category and the score",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=_handler,
    )
    source = (
        "# Yahtzee\n\neach row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |"
    )
    p = plan(parse("y.md", source), r)
    run = _capture_run(p)
    run()  # should not raise


TABLE_DOC = (
    "# T\n\nuppercase each one:\n\n"
    "| before | after |\n| ------ | ----- |\n"
    "| var    | VAR   |\n| bdd    | BDD   |"
)

DOCSTRING_DOC = "# T\n\nthe greeting is:\n\n```text\nHello, world!\n```"


def _runs_for(source: str, reg: Registry) -> list[Any]:
    p = plan(parse("w.md", source), reg)
    runs: list[Any] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            runs.append(run)

    execute_plan(p, ExecutePorts(sink=_S(), reporter=_noop_reporter()))
    return runs


def test_whole_table_sensor_returning_mismatched_table_raises_cell_mismatch_error() -> None:
    """A whole-table sensor returning a mismatched table throws CellMismatchError."""
    r = add_step(
        create_registry(),
        expression="uppercase each one",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=lambda *_: [["var", "WRONG"], ["bdd", "BDD"]],
    )
    caught: Any = None
    try:
        _runs_for(TABLE_DOC, r)[0]()
    except Exception as e:
        caught = e
    assert is_cell_mismatch_error(caught)
    cells = caught.cells
    assert len(cells) == 1
    assert cells[0].expected == "VAR"
    assert cells[0].actual == "WRONG"
    assert TABLE_DOC[cells[0].span.start_offset : cells[0].span.end_offset] == "VAR"


def test_whole_table_sensor_returning_matching_table_passes() -> None:
    """A whole-table sensor returning a matching table passes."""
    r = add_step(
        create_registry(),
        expression="uppercase each one",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=lambda *_: [{"before": "var", "after": "VAR"}, {"before": "bdd", "after": "BDD"}],
    )
    _runs_for(TABLE_DOC, r)[0]()  # should not raise


def test_whole_table_sensor_returning_wrong_type_raises_return_shape_error() -> None:
    """A whole-table sensor returning the wrong type throws ReturnShapeError."""
    r = add_step(
        create_registry(),
        expression="uppercase each one",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=lambda *_: "not a table",
    )
    with pytest.raises(ReturnShapeError):
        _runs_for(TABLE_DOC, r)[0]()


def test_doc_string_sensor_returning_different_string_raises_cell_mismatch_error() -> None:
    """A doc-string sensor returning a different string throws CellMismatchError."""
    r = add_step(
        create_registry(),
        expression="the greeting is",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=lambda *_: "Goodbye!\n",
    )
    caught: Any = None
    try:
        _runs_for(DOCSTRING_DOC, r)[0]()
    except Exception as e:
        caught = e
    assert is_cell_mismatch_error(caught)
    cell = caught.cells[0]
    assert cell.column == "doc string"
    # JSON-quoted, so a whitespace-only difference stays visible.
    assert cell.expected == '"Hello, world!\\n"'
    assert cell.actual == '"Goodbye!\\n"'
    assert DOCSTRING_DOC[cell.span.start_offset : cell.span.end_offset] == "Hello, world!\n"


def test_whole_table_action_returning_none_passes() -> None:
    """A whole-table action returning None passes (asserted nothing)."""
    r = add_step(
        create_registry(),
        expression="uppercase each one",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    _runs_for(TABLE_DOC, r)[0]()  # should not raise


def test_doc_string_action_returning_none_passes() -> None:
    """A doc-string action returning None passes (asserted nothing)."""
    r = add_step(
        create_registry(),
        expression="the greeting is",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    _runs_for(DOCSTRING_DOC, r)[0]()  # should not raise


def test_doc_string_sensor_returning_exact_body_passes() -> None:
    """A doc-string sensor returning the exact body passes."""
    r = add_step(
        create_registry(),
        expression="the greeting is",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="sensor",
        handler=lambda _ctx, body: body,  # echo the content bare (only slot)
    )
    _runs_for(DOCSTRING_DOC, r)[0]()  # should not raise


def test_execute_plan_passes_each_example_deduped_step_lines_via_info() -> None:
    """executePlan passes each example its deduped 1-based step lines via info."""
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="inline",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    r = add_step(
        r,
        expression="I eat {int} cukes",
        expression_source_file="inline",
        expression_source_line=2,
        kind="stimulus",
        handler=lambda *_: None,
    )
    source = "# T\n\nI have 5 cukes.\nI eat 2 cukes.\n"
    p = plan(parse("t.md", source), r)

    seen: list[dict] = []

    class _S:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            seen.append({"name": name, "lines": info["lines"] if info else None})

    execute_plan(p, ExecutePorts(sink=_S(), reporter=_noop_reporter()))
    assert len(seen) == 1
    assert seen[0]["lines"] == [3, 4]


# ---------------------------------------------------------------------------
# Expected-failure tests
# ---------------------------------------------------------------------------


def test_expected_failure_example_a_thrown_step_makes_run_resolve() -> None:
    """expected-failure example: a thrown step makes the run resolve (pass)."""

    def _handler(_ctx: Any, _a: int, b: int) -> None:
        if b == 0:
            raise ValueError("division by zero")

    r = add_step(
        create_registry(),
        expression="I divide {int} by {int}",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=_handler,
    )
    src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n"
    run = _capture_run(plan(parse("e.md", src), r))
    run()  # should not raise


def test_expected_failure_no_throw_makes_run_reject_with_unexpected_pass_error() -> None:
    """expected-failure example: no throw makes the run reject with UnexpectedPassError."""
    r = add_step(
        create_registry(),
        expression="I divide {int} by {int}",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    src = "# D\n\nI divide 1 by 1.\n\n```error\n```\n"
    run = _capture_run(plan(parse("e.md", src), r))
    with pytest.raises(UnexpectedPassError):
        run()


def test_expected_failure_with_message_substring_mismatch_rejects_with_real_error() -> None:
    """expected-failure with message substring: mismatch rejects with the real error."""

    def _handler(*_: Any) -> None:
        raise RuntimeError("boom")

    r = add_step(
        create_registry(),
        expression="I divide {int} by {int}",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=_handler,
    )
    src = "# D\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n"
    run = _capture_run(plan(parse("e.md", src), r))
    with pytest.raises(RuntimeError, match="boom"):
        run()


def test_observer_receives_pass_observation_per_executed_step() -> None:
    """observer receives a pass observation per executed step."""
    r = add_step(
        create_registry(),
        expression="I add {int}",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )
    obs: list[StepObservation] = []

    class _Obs:
        def step(self, o: StepObservation) -> None:
            obs.append(o)

    run = _capture_run(plan(parse("e.md", "# A\n\nI add 5."), r), _Obs())
    run()
    assert len(obs) == 1
    assert obs[0] == StepObservation(
        example_name="I add 5",
        example_index=0,
        ordinal=1,
        step_file="s.ts",
        outcome="pass",
    )


def test_observer_receives_fail_observation_when_a_step_throws() -> None:
    """observer receives a fail observation when a step throws."""

    def _blowup(*_: Any) -> None:
        raise RuntimeError("kaboom")

    r = add_step(
        create_registry(),
        expression="I blow up",
        expression_source_file="s.ts",
        expression_source_line=1,
        kind="stimulus",
        handler=_blowup,
    )
    obs: list[StepObservation] = []

    class _Obs:
        def step(self, o: StepObservation) -> None:
            obs.append(o)

    run = _capture_run(plan(parse("e.md", "# A\n\nI blow up."), r), _Obs())
    try:
        run()
    except Exception:
        pass
    assert len(obs) == 1
    assert obs[0].outcome == "fail"
    assert obs[0].error is not None


# ---------------------------------------------------------------------------
# execute-state.test.ts — return-merge state model
# ---------------------------------------------------------------------------

FILE = "s.steps.ts"


def _run_capturing_error(
    source: str,
    register: Any,
    create_context: Any,
) -> tuple[list[Any], Any]:
    """Run plan and return (ctx_seen_list, caught_error_holder)."""
    registry = register(create_registry())
    doc = parse("x.md", source)
    p = plan(doc, registry)
    caught: list[Any] = [None]

    class _S:
        def example(self, name: str, fn: Any, info: Any = None) -> None:
            try:
                fn()
            except Exception as e:
                caught[0] = e

    ports = ExecutePorts(
        sink=_S(),
        reporter=_noop_reporter(),
        create_context=create_context,
    )
    execute_plan(p, ports)
    return caught


def test_context_action_return_merges_into_state_and_threads_forward() -> None:
    """a context/action object return merges into state and threads forward."""
    seen: list[Any] = []

    def register(r: Registry) -> Registry:
        r = add_step(
            r,
            expression="I greet",
            expression_source_file=FILE,
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: {"greeting": "hi", "count": 1},
        )
        return add_step(
            r,
            expression="observe",
            expression_source_file=FILE,
            expression_source_line=2,
            kind="sensor",
            handler=lambda state: seen.append(state),
        )

    caught = _run_capturing_error("# X\n\nI greet\nobserve\n", register, lambda _: {})
    assert caught[0] is None
    assert len(seen) == 1
    assert seen[0] == {"greeting": "hi", "count": 1}


def test_stimulus_return_fully_replaces_state() -> None:
    """a stimulus return IS the next state — keys it omits are dropped, not merged."""
    seen: list[Any] = []

    def register(r: Registry) -> Registry:
        r = add_step(
            r,
            expression="step one",
            expression_source_file=FILE,
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: {"a": 1, "b": 2},
        )
        r = add_step(
            r,
            expression="step two",
            expression_source_file=FILE,
            expression_source_line=2,
            kind="stimulus",
            handler=lambda *_: {"b": 3},
        )
        return add_step(
            r,
            expression="observe",
            expression_source_file=FILE,
            expression_source_line=3,
            kind="sensor",
            handler=lambda state: seen.append(state),
        )

    caught = _run_capturing_error(
        "# X\n\nstep one\nstep two\nobserve\n", register, lambda _: {}
    )
    assert caught[0] is None
    # Under the full-replacement model {"b": 3} IS the next state: "a" is gone.
    assert seen[0] == {"b": 3}


def test_stimulus_returning_a_non_dict_is_a_return_shape_error() -> None:
    """a stimulus must return the complete next state, not a scalar."""

    def register(r: Registry) -> Registry:
        return add_step(
            r,
            expression="step one",
            expression_source_file=FILE,
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: 42,
        )

    caught = _run_capturing_error("# X\n\nstep one\n", register, lambda _: {})
    assert isinstance(caught[0], ReturnShapeError)
    assert "complete next state" in str(caught[0])


def test_undefined_return_from_context_action_is_no_op() -> None:
    """an undefined (void) return from a context/action is a no-op."""
    seen: list[Any] = []

    def register(r: Registry) -> Registry:
        r = add_step(
            r,
            expression="noop",
            expression_source_file=FILE,
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: None,
        )
        return add_step(
            r,
            expression="observe",
            expression_source_file=FILE,
            expression_source_line=2,
            kind="sensor",
            handler=lambda state: seen.append(state),
        )

    caught = _run_capturing_error(
        "# X\n\nnoop\nobserve\n", register, lambda _: {"a": 1}
    )
    assert caught[0] is None
    assert seen[0] == {"a": 1}


def test_factory_state_reaches_the_handler_as_the_author_own_dict() -> None:
    """The factory's dict arrives unfrozen, by identity, still a plain dict."""
    made: dict[str, Any] = {"a": 1}
    seen: list[Any] = []

    def _observe(state: Any) -> None:
        seen.append(state)

    def register(r: Registry) -> Registry:
        return add_step(
            r,
            expression="observe",
            expression_source_file=FILE,
            expression_source_line=1,
            kind="sensor",
            handler=_observe,
        )

    caught = _run_capturing_error("# X\n\nobserve\n", register, lambda _: made)
    assert caught[0] is None
    assert seen[0] is made
    assert type(seen[0]) is dict


def test_state_a_stimulus_returns_is_threaded_on_by_identity() -> None:
    """A returned dict is threaded on unfrozen, and its lists stay lists."""
    nxt: dict[str, Any] = {"a": 1, "items": [1, 2]}
    seen: list[Any] = []

    def _observe(state: Any) -> None:
        seen.append(state)

    def register(r: Registry) -> Registry:
        r = add_step(
            r,
            expression="step one",
            expression_source_file=FILE,
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: nxt,
        )
        return add_step(
            r,
            expression="observe",
            expression_source_file=FILE,
            expression_source_line=2,
            kind="sensor",
            handler=_observe,
        )

    caught = _run_capturing_error("# X\n\nstep one\nobserve\n", register, lambda _: {})
    assert caught[0] is None
    assert seen[0] is nxt
    assert type(seen[0]) is dict
    assert type(seen[0]["items"]) is list


# ---------------------------------------------------------------------------
# execute-roles.test.ts — sensor / action / context roles
# ---------------------------------------------------------------------------


def _run_one(
    source: str,
    register: Any,
) -> list[Any]:
    """Run plan and return caught-error holder."""
    registry = register(create_registry())
    doc = parse("x.md", source)
    p = plan(doc, registry)
    caught: list[Any] = [None]

    class _S:
        def example(self, name: str, fn: Any, info: Any = None) -> None:
            try:
                fn()
            except Exception as e:
                caught[0] = e

    execute_plan(p, ExecutePorts(sink=_S(), reporter=_noop_reporter()))
    return caught


def test_sensor_returning_mismatching_inline_value_throws_cell_mismatch_error() -> None:
    """a sensor returning a mismatching inline value throws CellMismatchError."""
    caught = _run_one(
        "# X\n\nI should have 3 cukes in my big belly\n",
        lambda r: add_step(
            r,
            expression="I should have {int} cukes in my {word} belly",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda _ctx, _count, name: [4, name],
        ),
    )
    assert is_cell_mismatch_error(caught[0])


def test_sensor_returning_matching_inline_values_passes() -> None:
    """a sensor returning matching inline values passes."""
    caught = _run_one(
        "# X\n\nI should have 3 cukes in my big belly\n",
        lambda r: add_step(
            r,
            expression="I should have {int} cukes in my {word} belly",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda _ctx, count, name: [count, name],
        ),
    )
    assert caught[0] is None


def test_sensor_returning_wrong_tuple_length_raises_return_shape_error() -> None:
    """a sensor returning the wrong tuple length throws ReturnShapeError."""
    caught = _run_one(
        "# X\n\nI should have 3 cukes in my big belly\n",
        lambda r: add_step(
            r,
            expression="I should have {int} cukes in my {word} belly",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: [4],
        ),
    )
    assert isinstance(caught[0], ReturnShapeError)


def test_single_parameter_sensor_returns_the_bare_value() -> None:
    """a single-parameter sensor returns the bare value, not a list."""
    caught = _run_one(
        "# X\n\nThe total is 42\n",
        lambda r: add_step(
            r,
            expression="The total is {int}",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: 42,
        ),
    )
    assert caught[0] is None


def test_single_parameter_sensor_wrapping_its_value_fails_the_comparison() -> None:
    """[42] is compared as-is against 42 — lists are never read as tuples with one slot."""
    caught = _run_one(
        "# X\n\nThe total is 42\n",
        lambda r: add_step(
            r,
            expression="The total is {int}",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: [42],
        ),
    )
    assert is_cell_mismatch_error(caught[0])


def test_single_parameter_transforming_to_a_list_is_deep_compared_bare() -> None:
    """a single parameter whose type transforms to a list is deep-compared bare."""

    def _register(r: Registry) -> Registry:
        r = define_parameter_type(
            r,
            name="numbers",
            regexp=r"\d+(?:, \d+)*",
            parse=lambda raw: [int(n) for n in raw.split(", ")],
        )
        return add_step(
            r,
            expression="The dice show {numbers}",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: [5, 6],
        )

    caught = _run_one("# X\n\nThe dice show 5, 6\n", _register)
    assert caught[0] is None


def test_zero_slot_sensor_returning_a_value_raises_return_shape_error() -> None:
    """a zero-slot sensor returning a value throws ReturnShapeError."""
    caught = _run_one(
        "# X\n\nThe alarm fired\n",
        lambda r: add_step(
            r,
            expression="The alarm fired",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: True,
        ),
    )
    assert isinstance(caught[0], ReturnShapeError)


def test_zero_slot_sensor_returning_none_passes() -> None:
    """a zero-slot sensor returning None passes."""
    caught = _run_one(
        "# X\n\nThe alarm fired\n",
        lambda r: add_step(
            r,
            expression="The alarm fired",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: None,
        ),
    )
    assert caught[0] is None


def test_slotted_sensor_returning_none_raises_return_shape_error() -> None:
    """A sensor with a slot that returns nothing raises ReturnShapeError.

    The silent-pass hole: a typo'd lookup returns None, nothing is compared, and
    the document keeps claiming something nobody checked.
    """
    caught = _run_one(
        '# X\n\nThe name is "Ada"\n',
        lambda r: add_step(
            r,
            expression="The name is {string}",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: None,
        ),
    )
    assert isinstance(caught[0], ReturnShapeError)
    assert str(caught[0]) == (
        "a sensor with 1 slot(s) must return one value per slot, got nothing"
    )


def test_header_bound_row_returning_none_raises_return_shape_error() -> None:
    """A header-bound row step that returns nothing raises ReturnShapeError."""
    source = (
        "# X\n\nI report the score and grade.\n\n"
        "| score | grade |\n"
        "| ----- | ----- |\n"
        "| 10    | A     |\n"
    )
    caught = _run_one(
        source,
        lambda r: add_step(
            r,
            expression="I report the score and grade",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: None,
        ),
    )
    assert isinstance(caught[0], ReturnShapeError)
    assert str(caught[0]) == (
        "a header-bound row step must return a row object with one value per"
        " bound cell, got nothing"
    )


def test_action_returning_non_dict_raises_return_shape_error() -> None:
    """an action that returns a non-dict value throws ReturnShapeError."""
    caught = _run_one(
        "# X\n\nI fly to LHR\n",
        lambda r: add_step(
            r,
            expression="I fly to {word}",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: "oops",
        ),
    )
    assert isinstance(caught[0], ReturnShapeError)


def test_context_step_returning_non_dict_raises_return_shape_error() -> None:
    """a context step that returns a non-dict value throws ReturnShapeError."""
    caught = _run_one(
        "# X\n\nI set up the world\n",
        lambda r: add_step(
            r,
            expression="I set up the world",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="stimulus",
            handler=lambda *_: "oops",
        ),
    )
    assert isinstance(caught[0], ReturnShapeError)


def test_sensor_with_trailing_data_table_returning_correct_table_passes() -> None:
    """a sensor with a trailing data table returning the correct table passes."""
    source = "# X\n\nI list the items:\n\n| name | value |\n| ---- | ----- |\n| foo  | bar   |\n"
    caught = _run_one(
        source,
        lambda r: add_step(
            r,
            expression="I list the items",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: [{"name": "foo", "value": "bar"}],
        ),
    )
    assert caught[0] is None


def test_sensor_with_trailing_data_table_returning_wrong_cell_raises_cell_mismatch_error() -> None:
    """a sensor with a trailing data table returning the wrong cell throws CellMismatchError."""
    source = "# X\n\nI list the items:\n\n| name | value |\n| ---- | ----- |\n| foo  | bar   |\n"
    caught = _run_one(
        source,
        lambda r: add_step(
            r,
            expression="I list the items",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda *_: [{"name": "foo", "value": "WRONG"}],
        ),
    )
    assert is_cell_mismatch_error(caught[0])


def test_sensor_with_trailing_doc_string_returning_exact_content_passes() -> None:
    """a sensor with a trailing doc string returning the exact content passes."""
    source = "# X\n\nthe greeting is:\n\n```text\nHello, world!\n```\n"
    caught = _run_one(
        source,
        lambda r: add_step(
            r,
            expression="the greeting is",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda _ctx, body: body,
        ),
    )
    assert caught[0] is None


def test_sensor_with_trailing_doc_string_returning_wrong_text_raises_cell_mismatch_error() -> None:
    """a sensor with a trailing doc string returning the wrong text throws CellMismatchError."""
    source = "# X\n\nthe greeting is:\n\n```text\nHello, world!\n```\n"
    caught = _run_one(
        source,
        lambda r: add_step(
            r,
            expression="the greeting is",
            expression_source_file="s.steps.ts",
            expression_source_line=1,
            kind="sensor",
            handler=lambda _ctx, _body: "Goodbye!\n",
        ),
    )
    assert is_cell_mismatch_error(caught[0])
    assert str(caught[0]) == 'doc string: expected "Hello, world!\\n" but was "Goodbye!\\n"'


# ---------------------------------------------------------------------------
# Async handler tests
# ---------------------------------------------------------------------------


def test_async_def_handlers_are_driven_to_completion() -> None:
    """async def context/action and sensor handlers are driven to completion via asyncio.run.

    If the async path is broken (coroutine not awaited), the action's state
    merge would never happen and the sensor would fail with ReturnShapeError
    (a raw coroutine object is not a list/tuple) or see stale state.
    """
    seen: list[Any] = []

    async def _async_action(state: Any, n: int) -> dict:
        return {"count": n}

    async def _async_sensor(state: Any, expected: int) -> int:
        seen.append(state["count"])
        return state["count"]

    r = add_step(
        add_step(
            create_registry(),
            expression="set count to {int}",
            expression_source_file="async.ts",
            expression_source_line=1,
            kind="stimulus",
            handler=_async_action,
        ),
        expression="count is {int}",
        expression_source_file="async.ts",
        expression_source_line=2,
        kind="sensor",
        handler=_async_sensor,
    )
    p = plan(parse("a.md", "# Async\n\nset count to 5. count is 5.\n"), r)
    run = _capture_run(p)
    run()  # must not raise
    assert seen == [5], "async sensor was not driven to completion or state was not merged"
