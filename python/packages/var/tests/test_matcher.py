"""Tests for var.matcher — port of var-core/tests/matcher.test.ts."""
from __future__ import annotations

from var.matcher import ParamSpan, find_hits, resolve_hits
from var.registry import Registry, add_step, create_registry


def _noop(*_args: object, **_kwargs: object) -> None:
    pass


def reg() -> Registry:
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="steps.ts",
        expression_source_line=1,
        handler=_noop,
    )
    r = add_step(
        r,
        expression="I withdraw {int}",
        expression_source_file="steps.ts",
        expression_source_line=5,
        handler=_noop,
    )
    return r


# ---------------------------------------------------------------------------
# find_hits
# ---------------------------------------------------------------------------


def test_find_hits_no_match() -> None:
    assert find_hits("hello world", reg()) == ()


def test_find_hits_one_match_with_args_and_spans() -> None:
    hits = find_hits("Given I have 5 cukes in my belly", reg())
    assert len(hits) == 1
    h = hits[0]
    assert h.expression == "I have {int} cukes"
    assert h.match_start == 6
    assert h.match_end == 20
    assert h.args == (5,)
    # {int} '5' is at sentence offset 13..14 (all ASCII → cp == UTF-16)
    assert h.param_spans == (ParamSpan(start=13, end=14),)


def test_find_hits_multiple_non_overlapping() -> None:
    hits = find_hits("I have 5 cukes and I withdraw 3", reg())
    assert [h.expression for h in hits] == ["I have {int} cukes", "I withdraw {int}"]


# ---------------------------------------------------------------------------
# resolve_hits
# ---------------------------------------------------------------------------


def test_resolve_hits_picks_longest_leftmost() -> None:
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        handler=_noop,
    )
    r = add_step(
        r,
        expression="I have {int} cukes in my belly",
        expression_source_file="s.ts",
        expression_source_line=2,
        handler=_noop,
    )
    hits = find_hits("I have 5 cukes in my belly", r)
    result = resolve_hits(hits)
    assert result.kind == "ok"
    assert len(result.steps) == 1
    assert result.steps[0].expression == "I have {int} cukes in my belly"


def test_resolve_hits_ambiguous_same_start_same_length() -> None:
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        handler=_noop,
    )
    r = add_step(
        r,
        expression="I have {int} {word}",
        expression_source_file="s.ts",
        expression_source_line=2,
        handler=_noop,
    )
    hits = find_hits("I have 5 cukes", r)
    result = resolve_hits(hits)
    assert result.kind == "ambiguous"
    assert len(result.collisions) == 1
    assert len(result.collisions[0].candidates) == 2


def test_resolve_hits_all_non_overlapping_left_to_right() -> None:
    r = create_registry()
    r = add_step(
        r,
        expression="I have {int} cukes",
        expression_source_file="s.ts",
        expression_source_line=1,
        handler=_noop,
    )
    r = add_step(
        r,
        expression="I withdraw {int}",
        expression_source_file="s.ts",
        expression_source_line=2,
        handler=_noop,
    )
    hits = find_hits("Given I have 5 cukes and I withdraw 3", r)
    result = resolve_hits(hits)
    assert result.kind == "ok"
    assert [s.expression for s in result.steps] == [
        "I have {int} cukes",
        "I withdraw {int}",
    ]


# ---------------------------------------------------------------------------
# Astral character (UTF-16 span shift)
# ---------------------------------------------------------------------------


def test_find_hits_astral_emoji_shifts_utf16_spans() -> None:
    """😀 is U+1F600 — 1 code point but 2 UTF-16 code units.

    A match after the emoji must have its param_spans shifted by +1 compared
    to what Python's re (which counts code points) would naively give.
    """
    r = create_registry()
    r = add_step(
        r,
        expression="I order {string}",
        expression_source_file="s.ts",
        expression_source_line=1,
        handler=_noop,
    )
    sentence = '😀 I order "pizza"'
    hits = find_hits(sentence, r)
    assert len(hits) == 1
    h = hits[0]
    # 😀 (2 UTF-16 units) + ' ' (1) → 'I' starts at UTF-16 offset 3
    assert h.match_start == 3
    # 'I order "pizza"' is 15 code points/units (all BMP) → ends at 3+15 = 18
    assert h.match_end == 18
    assert h.args == ("pizza",)
    # group covers '"pizza"' (8..15 within the matched substring),
    # absolute cp: 2+8=10 → UTF-16 11; 2+15=17 → UTF-16 18
    assert h.param_spans == (ParamSpan(start=11, end=18),)
