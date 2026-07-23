"""test_drift.py — port of typescript/packages/core/tests/drift.test.ts."""
from __future__ import annotations

from varar_core.drift import (
    BaselineExample,
    SpecBaseline,
    VarLock,
    derive_spec_baseline,
    detect_drift,
    drift_diagnostics,
    live_examples,
    parse_var_lock,
    reconcile_drift,
    stringify_var_lock,
)
from varar_core.hash import hash_source
from varar_core.parse import parse
from varar_core.plan import plan
from varar_core.registry import add_step, create_registry


def _noop(*_args: object, **_kwargs: object) -> None:
    pass


def _reg(with_step: bool = True):
    r = create_registry()
    if with_step:
        r = add_step(
            r,
            expression="I withdraw {int}",
            expression_source_file="steps.ts",
            expression_source_line=1,
            handler=_noop,
            kind="stimulus",
        )
    return r


def _roman_reg(with_step: bool = True):
    r = create_registry()
    if with_step:
        r = add_step(
            r,
            expression="a decimal and a roman number",
            expression_source_file="steps.ts",
            expression_source_line=1,
            handler=_noop,
            kind="sensor",
        )
    return r


def _bare(drifts) -> list[tuple[str, int]]:
    return [(d.name, d.line) for d in drifts]


class MemoryStore:
    def __init__(self, initial: str | None = None) -> None:
        self.contents = initial

    def read(self) -> str | None:
        return self.contents

    def write(self, contents: str) -> None:
        self.contents = contents


def test_live_examples_records_one_entry_per_example_producing_paragraph() -> None:
    var_doc = parse("w.md", "I withdraw 40.")
    assert live_examples(var_doc, plan(var_doc, _reg())) == (
        BaselineExample(name="I withdraw 40", line=1),
    )


def test_a_never_matched_paragraph_is_not_a_live_example() -> None:
    var_doc = parse("w.md", "Just some prose.")
    assert live_examples(var_doc, plan(var_doc, _reg())) == ()


def test_derive_spec_baseline_carries_the_source_fingerprint() -> None:
    source = "I withdraw 40."
    var_doc = parse("w.md", source)
    baseline = derive_spec_baseline(source, var_doc, plan(var_doc, _reg()))
    assert baseline.source_hash == hash_source(source)
    assert baseline.examples == (BaselineExample(name="I withdraw 40", line=1),)


def test_no_baseline_means_no_drift() -> None:
    var_doc = parse("w.md", "I withdraw 40.")
    assert detect_drift(None, var_doc, plan(var_doc, _reg())) == ()


def test_an_unchanged_spec_and_steps_have_no_drift() -> None:
    source = "I withdraw 40."
    var_doc = parse("w.md", source)
    baseline = derive_spec_baseline(source, var_doc, plan(var_doc, _reg()))
    assert detect_drift(baseline, var_doc, plan(var_doc, _reg())) == ()


def test_a_renamed_step_drifts_matched_by_name() -> None:
    source = "I withdraw 40."
    var_doc = parse("w.md", source)
    baseline = derive_spec_baseline(source, var_doc, plan(var_doc, _reg(True)))
    drift = detect_drift(baseline, var_doc, plan(var_doc, _reg(False)))
    assert _bare(drift) == [("I withdraw 40", 1)]


def test_an_in_place_typo_drifts_matched_by_line() -> None:
    before = "I withdraw 40."
    before_doc = parse("w.md", before)
    baseline = derive_spec_baseline(before, before_doc, plan(before_doc, _reg()))
    after_doc = parse("w.md", "I withdrraw 40.")
    drift = detect_drift(baseline, after_doc, plan(after_doc, _reg()))
    assert _bare(drift) == [("I withdraw 40", 1)]


def test_a_deleted_paragraph_is_not_drift() -> None:
    before = "I withdraw 40."
    before_doc = parse("w.md", before)
    baseline = derive_spec_baseline(before, before_doc, plan(before_doc, _reg()))
    after_doc = parse("w.md", "")
    assert detect_drift(baseline, after_doc, plan(after_doc, _reg())) == ()


def test_moving_and_rewording_a_still_matching_example_does_not_drift() -> None:
    before = "I withdraw 40.\n\nI withdraw 10."
    before_doc = parse("w.md", before)
    baseline = derive_spec_baseline(before, before_doc, plan(before_doc, _reg()))
    after_doc = parse("w.md", "I withdraw 11.\n\nI withdraw 40.")
    assert detect_drift(baseline, after_doc, plan(after_doc, _reg())) == ()


def test_move_plus_reword_plus_prose_on_old_line_does_not_false_positive() -> None:
    before = "I withdraw 40."
    before_doc = parse("w.md", before)
    baseline = derive_spec_baseline(before, before_doc, plan(before_doc, _reg()))
    after_doc = parse("w.md", "Just some notes.\n\nI withdraw 41.")
    assert detect_drift(baseline, after_doc, plan(after_doc, _reg())) == ()


def test_a_paragraph_rewritten_past_recognition_is_remove_add_not_drift() -> None:
    before = "I withdraw 40."
    before_doc = parse("w.md", before)
    baseline = derive_spec_baseline(before, before_doc, plan(before_doc, _reg()))
    after_doc = parse("w.md", "The branch closed years ago.")
    assert detect_drift(baseline, after_doc, plan(after_doc, _reg())) == ()


_ROMAN = (
    "Each row gives a decimal and a roman number:\n\n"
    "| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n"
)


def test_header_bound_table_records_its_binding_paragraph_once() -> None:
    var_doc = parse("r.md", _ROMAN)
    assert live_examples(var_doc, plan(var_doc, _roman_reg())) == (
        BaselineExample(name="Each row gives a decimal and a roman number:", line=1),
    )


def test_a_header_bound_binding_paragraph_that_stops_matching_drifts() -> None:
    var_doc = parse("r.md", _ROMAN)
    baseline = derive_spec_baseline(_ROMAN, var_doc, plan(var_doc, _roman_reg(True)))
    drift = detect_drift(baseline, var_doc, plan(var_doc, _roman_reg(False)))
    assert _bare(drift) == [("Each row gives a decimal and a roman number:", 1)]


def test_drift_diagnostics_are_error_severity() -> None:
    source = "I withdraw 40."
    var_doc = parse("w.md", source)
    baseline = derive_spec_baseline(source, var_doc, plan(var_doc, _reg(True)))
    diags = drift_diagnostics(detect_drift(baseline, var_doc, plan(var_doc, _reg(False))))
    assert len(diags) == 1
    assert diags[0].severity == "error"
    assert diags[0].code == "drift"
    assert "I withdraw 40" in diags[0].message


def test_reconcile_records_on_first_run_then_reports_and_preserves_on_drift() -> None:
    source = "I withdraw 40."
    var_doc = parse("w.md", source)
    store = MemoryStore()
    assert reconcile_drift(store, "w.md", source, var_doc, plan(var_doc, _reg(True))) == ()
    before = store.contents
    drift = reconcile_drift(store, "w.md", source, var_doc, plan(var_doc, _reg(False)))
    assert _bare(drift) == [("I withdraw 40", 1)]
    assert store.contents == before  # baseline untouched while drift unacknowledged


def test_reconcile_update_mode_accepts_drift() -> None:
    source = "I withdraw 40."
    var_doc = parse("w.md", source)
    store = MemoryStore()
    reconcile_drift(store, "w.md", source, var_doc, plan(var_doc, _reg(True)))
    drift = reconcile_drift(
        store, "w.md", source, var_doc, plan(var_doc, _reg(False)), update=True
    )
    assert drift == ()
    lock = parse_var_lock(store.contents or "")
    assert lock is not None
    assert lock.specs["w.md"].examples == ()


_EXPECTED_LOCK = """\
{
  "version": 1,
  "specs": {
    "library.md": {
      "sourceHash": "fnv1a:1a2b3c4d",
      "examples": [
        {
          "name": "I check out",
          "line": 7
        }
      ]
    }
  }
}
"""


def test_stringify_matches_the_typescript_serializer_byte_for_byte() -> None:
    lock = VarLock(
        version=1,
        specs={
            "library.md": SpecBaseline(
                source_hash="fnv1a:1a2b3c4d",
                examples=(BaselineExample(name="I check out", line=7),),
            )
        },
    )
    assert stringify_var_lock(lock) == _EXPECTED_LOCK


def test_parse_round_trips_a_valid_lock() -> None:
    lock = VarLock(
        version=1,
        specs={
            "library.md": SpecBaseline(
                source_hash="fnv1a:1a2b3c4d",
                examples=(BaselineExample(name="I check out", line=7),),
            )
        },
    )
    assert parse_var_lock(stringify_var_lock(lock)) == lock


def test_stringify_sorts_spec_paths() -> None:
    lock = VarLock(
        version=1,
        specs={
            "zebra.md": SpecBaseline(source_hash="fnv1a:00000001", examples=()),
            "alpha.md": SpecBaseline(source_hash="fnv1a:00000002", examples=()),
        },
    )
    text = stringify_var_lock(lock)
    assert text.index("alpha.md") < text.index("zebra.md")
    assert text.endswith("}\n")


def test_parse_rejects_malformed_input() -> None:
    assert parse_var_lock("not json") is None
    assert parse_var_lock("{}") is None
    assert parse_var_lock('{"version":2,"specs":{}}') is None
    assert parse_var_lock('{"version":1,"specs":{"a.md":{"examples":[]}}}') is None


# ---- Merged examples keep per-paragraph drift granularity (ADR 0012) -------


def _deposit_withdraw_reg(with_deposit: bool = True):
    r = create_registry()
    if with_deposit:
        r = add_step(
            r,
            expression="I deposit {int}",
            expression_source_file="steps.ts",
            expression_source_line=1,
            handler=_noop,
            kind="stimulus",
        )
    r = add_step(
        r,
        expression="I withdraw {int}",
        expression_source_file="steps.ts",
        expression_source_line=2,
        handler=_noop,
        kind="stimulus",
    )
    return r


def test_two_paragraphs_that_merge_are_each_recorded_as_a_live_baseline_entry() -> None:
    source = "I deposit 100.\n\nI withdraw 40."
    var_doc = parse("w.md", source)
    plan1 = plan(var_doc, _deposit_withdraw_reg())
    # One planned example (the two paragraphs merged), but two live entries.
    assert len(plan1.examples) == 1
    assert live_examples(var_doc, plan1) == (
        BaselineExample(name="I deposit 100", line=1),
        BaselineExample(name="I withdraw 40", line=3),
    )


def test_deleting_one_step_def_of_a_merged_example_drifts_only_the_now_prose_paragraph() -> None:
    source = "I deposit 100.\n\nI withdraw 40."
    var_doc = parse("w.md", source)
    baseline = derive_spec_baseline(source, var_doc, plan(var_doc, _deposit_withdraw_reg(True)))
    # The deposit step is gone: its paragraph becomes prose, splitting the
    # example. The withdraw paragraph is still live; the deposit one drifts.
    drift = detect_drift(baseline, var_doc, plan(var_doc, _deposit_withdraw_reg(False)))
    assert _bare(drift) == [("I deposit 100", 1)]
