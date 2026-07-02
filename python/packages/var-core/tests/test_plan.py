"""test_plan.py — port of typescript/packages/var-core/tests/plan.test.ts."""
from __future__ import annotations

from var_core.parse import parse
from var_core.plan import plan
from var_core.registry import add_step, create_registry


def _noop(*_args: object, **_kwargs: object) -> None:
    pass


def _reg():
    r = create_registry()
    r = add_step(r, expression="I have {int} in my account", expression_source_file="steps.ts", expression_source_line=1, handler=_noop, kind="action")
    r = add_step(r, expression="I withdraw {int}", expression_source_file="steps.ts", expression_source_line=2, handler=_noop, kind="action")
    r = add_step(r, expression="I should have {int} left", expression_source_file="steps.ts", expression_source_line=3, handler=_noop, kind="action")
    return r


def test_plan_produces_a_planned_example_with_steps_in_document_order() -> None:
    source = "# Withdrawing\n\nGiven I have 100 in my account. When I withdraw 40. Then I should have 60 left."
    var_doc = parse("w.md", source)
    result = plan(var_doc, _reg())
    assert result.diagnostics == ()
    assert len(result.examples) == 1
    ex = result.examples[0]
    assert ex.name == "Given I have 100 in my account. When I withdraw 40. Then I should have 60 left"
    assert ex.scope_stack == ("Withdrawing",)
    assert [s.text for s in ex.steps] == [
        "I have 100 in my account",
        "I withdraw 40",
        "I should have 60 left",
    ]
    assert ex.steps[0].args == (100,)


def test_plan_emits_ambiguous_match_diagnostic_and_no_steps() -> None:
    r = create_registry()
    r = add_step(r, expression="I have {int} cukes", expression_source_file="a.ts", expression_source_line=3, handler=_noop, kind="action")
    r = add_step(r, expression="I have {int} {word}", expression_source_file="a.ts", expression_source_line=8, handler=_noop, kind="action")
    var_doc = parse("e.md", "# Ambig\n\nGiven I have 5 cukes")
    result = plan(var_doc, r)
    assert len(result.diagnostics) == 1
    assert result.diagnostics[0].code == "ambiguous-match"
    assert result.examples[0].steps == ()


def test_plan_skips_example_with_no_matches() -> None:
    source = "# Just docs\n\nSome prose with no matches and no keywords."
    var_doc = parse("d.md", source)
    result = plan(var_doc, _reg())
    assert result.examples == ()
    assert result.diagnostics == ()


def test_plan_turns_each_list_item_into_its_own_example() -> None:
    r = create_registry()
    r = add_step(r, expression="I have {int} in my account", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    r = add_step(r, expression="I withdraw {int}", expression_source_file="s.ts", expression_source_line=2, handler=_noop, kind="action")
    source = "# Bullets\n\n- Given I have 100 in my account\n- When I withdraw 40"
    result = plan(parse("b.md", source), r)
    assert len(result.examples) == 2
    assert [[s.text for s in e.steps] for e in result.examples] == [
        ["I have 100 in my account"],
        ["I withdraw 40"],
    ]


def test_plan_walks_blockquote_content_as_step_bearing() -> None:
    r = create_registry()
    r = add_step(r, expression="I have {int} in my account", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = "# Quote\n\n> Given I have 100 in my account"
    result = plan(parse("q.md", source), r)
    assert len(result.examples[0].steps) == 1


def test_markdown_table_immediately_after_step_attaches_as_data_table() -> None:
    r = create_registry()
    r = add_step(r, expression="these users exist", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = "# Users\nGiven these users exist:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |\n| Eve  | 25  |"
    result = plan(parse("u.md", source), r)
    step = result.examples[0].steps[0]
    assert step.data_table is not None
    assert step.data_table.header.cells == ("name", "age")
    assert len(step.data_table.rows) == 2


def test_table_not_immediately_after_step_does_not_attach() -> None:
    r = create_registry()
    r = add_step(r, expression="these users exist", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = "# Mid\nGiven these users exist:\n\nSome interrupting prose.\n\n| name | age |\n|------|-----|\n| Bob  | 30  |"
    result = plan(parse("m.md", source), r)
    step = result.examples[0].steps[0]
    assert step.data_table is None


def test_fenced_code_block_immediately_after_step_attaches_as_doc_string() -> None:
    r = create_registry()
    r = add_step(r, expression="I send the payload", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = "# Payload\nWhen I send the payload:\n\n```json\n{ \"action\": \"import\" }\n```"
    result = plan(parse("p.md", source), r)
    step = result.examples[0].steps[0]
    assert step.doc_string is not None
    assert step.doc_string.content_type == "json"
    assert step.doc_string.content == '{ "action": "import" }\n'


def test_step_with_no_following_fence_has_no_doc_string() -> None:
    r = create_registry()
    r = add_step(r, expression="I send the payload", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    result = plan(parse("p.md", "# P\nWhen I send the payload"), r)
    assert result.examples[0].steps[0].doc_string is None


def test_keyword_led_sentence_with_no_match_produces_no_diagnostic() -> None:
    r = create_registry()
    var_doc = parse("m.md", "# Empty\n\nGiven I have 5 cukes in my belly.")
    result = plan(var_doc, r)
    assert result.diagnostics == ()


def test_unmatched_sentence_without_keyword_is_silently_prose() -> None:
    r = create_registry()
    var_doc = parse("p.md", "# Prose\n\nI have 5 cukes in my belly.")
    result = plan(var_doc, r)
    assert result.diagnostics == ()


def test_header_bound_table_expands_into_one_example_per_row() -> None:
    r = create_registry()
    r = add_step(r, expression="each row lists the dice, the category and the score", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = (
        "# Yahtzee\n\n"
        "each row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |\n"
        "| 3, 3, 3, 3, 3 | Yahtzee    | 50    |"
    )
    result = plan(parse("y.md", source), r)
    assert result.diagnostics == ()
    assert len(result.examples) == 2
    first, second = result.examples
    assert len(first.steps) == 1
    assert first.steps[0].args == ({"dice": "3, 3, 3, 4, 4", "category": "full house", "score": "17"},)
    assert second.steps[0].args == ({"dice": "3, 3, 3, 3, 3", "category": "Yahtzee", "score": "50"},)
    # The table is NOT attached as a data_table on the step.
    assert first.steps[0].data_table is None


def test_table_whose_paragraph_names_only_some_header_cells_keeps_whole_table_behaviour() -> None:
    r = create_registry()
    r = add_step(r, expression="these users exist", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    # "these users exist" names neither `name` nor `age` — no row mode.
    source = (
        "# Users\nthese users exist:\n\n"
        "| name | age |\n| ---- | --- |\n| Bob  | 30  |\n| Eve  | 25  |"
    )
    result = plan(parse("u.md", source), r)
    assert len(result.examples) == 1
    step = result.examples[0].steps[0]
    assert step.data_table is not None
    assert step.data_table.header.cells == ("name", "age")
    assert len(step.data_table.rows) == 2


def test_header_bound_matching_is_case_sensitive() -> None:
    r = create_registry()
    r = add_step(r, expression="each row lists the Dice and the Score", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    # Headers are lower-case `dice`/`score`; the prose says `Dice`/`Score`.
    source = (
        "# Case\neach row lists the Dice and the Score:\n\n"
        "| dice      | score |\n| --------- | ----- |\n| 1,1,1,1,1 | 5     |"
    )
    result = plan(parse("c.md", source), r)
    # No exact-case match → falls back to a single whole-table example.
    assert len(result.examples) == 1
    assert result.examples[0].steps[0].data_table is not None
    assert len(result.examples[0].steps[0].data_table.rows) == 1


def test_header_bound_rows_are_named_by_cells_and_nested_under_paragraph() -> None:
    r = create_registry()
    r = add_step(r, expression="each row lists the dice, the category and the score", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = (
        "# Yahtzee\n\n"
        "each row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |\n"
        "| 3, 3, 3, 3, 3 | Yahtzee    | 50    |"
    )
    result = plan(parse("y.md", source), r)
    assert [e.name for e in result.examples] == [
        "3, 3, 3, 4, 4 / full house / 17",
        "3, 3, 3, 3, 3 / Yahtzee / 50",
    ]
    for ex in result.examples:
        assert ex.scope_stack == ("Yahtzee", "each row lists the dice, the category and the score")
    lines = [e.span.start_line for e in result.examples]
    assert len(set(lines)) == 2
    assert lines[0] < lines[1]


def test_detached_table_produces_no_diagnostic() -> None:
    r = create_registry()
    r = add_step(r, expression="I have {int} cukes", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = (
        "# Detached\n\n"
        "Given I have 5 cukes.\n\n"
        "Some interrupting prose paragraph.\n\n"
        "| name | age |\n|------|-----|\n| Bob  | 30  |"
    )
    result = plan(parse("o.md", source), r)
    assert result.diagnostics == ()


def test_header_bound_row_example_carries_row_checks() -> None:
    r = create_registry()
    r = add_step(r, expression="each row lists the dice, the category and the score", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = (
        "# Yahtzee\n\n"
        "each row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |"
    )
    result = plan(parse("y.md", source), r)
    checks = result.examples[0].row_checks
    assert checks is not None
    assert [c.column for c in checks] == ["dice", "category", "score"]
    assert [c.value for c in checks] == ["3, 3, 3, 4, 4", "full house", "17"]
    # The score cell span slices back to "17" in the source.
    score_check = checks[2]
    assert source[score_check.span.start_offset:score_check.span.end_offset] == "17"


def test_error_fence_marks_expected_outcome_fail_with_message() -> None:
    r = add_step(create_registry(), expression="I divide {int} by {int}", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    src = "# Division\n\nI divide 1 by 0.\n\n```error\ndivision by zero\n```\n"
    ex = plan(parse("e.md", src), r).examples[0]
    assert ex.expected_outcome == "fail"
    assert ex.expected_error_message == "division by zero"
    # The error fence must NOT become a docString attachment on the step.
    assert ex.steps[0].doc_string is None


def test_no_error_fence_leaves_expected_outcome_undefined() -> None:
    r = add_step(create_registry(), expression="I divide {int} by {int}", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    ex = plan(parse("e.md", "# Division\n\nI divide 1 by 1."), r).examples[0]
    assert ex.expected_outcome is None


def test_error_fence_with_no_matching_step_emits_error_fence_without_step() -> None:
    r = add_step(create_registry(), expression="I divide {int} by {int}", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    src = "# Nope\n\nThis prose matches nothing.\n\n```error\nboom\n```\n"
    result = plan(parse("e.md", src), r)
    assert result.examples == ()
    assert len(result.diagnostics) == 1
    assert result.diagnostics[0].code == "error-fence-without-step"


def test_error_fence_on_ambiguous_example_emits_both_diagnostics() -> None:
    r = create_registry()
    r = add_step(r, expression="I divide {int} by {int}", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    r = add_step(r, expression="I divide 1 by 0", expression_source_file="s.ts", expression_source_line=2, handler=_noop, kind="action")
    src = "# Ambiguous\n\nI divide 1 by 0.\n\n```error\nboom\n```\n"
    result = plan(parse("e.md", src), r)
    codes = sorted(d.code for d in result.diagnostics)
    assert codes == ["ambiguous-match", "error-fence-without-step"]


def test_header_binding_param_spans_point_at_header_cells_in_paragraph() -> None:
    """HeaderBinding.param_spans must be the header-cell word spans, not the step's regex captures."""
    r = create_registry()
    r = add_step(
        r,
        expression="each row lists the dice, the category and the score",
        expression_source_file="s.ts",
        expression_source_line=1,
        handler=_noop,
        kind="action",
    )
    source = (
        "# Yahtzee\n\n"
        "each row lists the dice, the category and the score:\n\n"
        "| dice          | category   | score |\n"
        "| ------------- | ---------- | ----- |\n"
        "| 3, 3, 3, 4, 4 | full house | 17    |"
    )
    result = plan(parse("y.md", source), r)
    assert len(result.examples) == 1
    ex = result.examples[0]
    assert ex.header_binding is not None
    hb = ex.header_binding
    # One span per header cell, not the step-expression regex captures (which are empty).
    assert len(hb.param_spans) == 3
    # Each span must slice back to the header-cell word in the source (ASCII so UTF-16 == CP).
    assert source[hb.param_spans[0].start_offset : hb.param_spans[0].end_offset] == "dice"
    assert source[hb.param_spans[1].start_offset : hb.param_spans[1].end_offset] == "category"
    assert source[hb.param_spans[2].start_offset : hb.param_spans[2].end_offset] == "score"


def test_doc_string_step_carries_fence_body_span() -> None:
    r = add_step(create_registry(), expression="the payload is", expression_source_file="s.ts", expression_source_line=1, handler=_noop, kind="action")
    source = "# T\n\nthe payload is:\n\n```json\n{ \"ok\": true }\n```"
    result = plan(parse("d.md", source), r)
    ds = result.examples[0].steps[0].doc_string
    assert ds is not None
    assert ds.content == '{ "ok": true }\n'
    # The span slices back to the exact body content (trailing newline included).
    assert source[ds.span.start_offset:ds.span.end_offset] == '{ "ok": true }\n'
