"""Matcher — port of var-core/src/matcher.ts.

Public API
----------
find_hits(sentence, registry)  -> tuple[Hit, ...]
resolve_hits(hits)             -> ResolvedSteps

ResolvedSteps is a frozen dataclass with:
    kind        : Literal["ok", "ambiguous"]
    steps       : tuple[Hit, ...]          (non-empty when kind == "ok")
    collisions  : tuple[AmbiguityCollision, ...]  (non-empty when kind == "ambiguous")

Downstream (Task 13) should branch on ``result.kind``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

from var.registry import Registry, StepRegistration
from var.span import to_utf16_offset

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Data types (frozen, immutable — project constraint)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ParamSpan:
    """UTF-16 start/end of one captured parameter within the sentence."""

    start: int
    end: int


@dataclass(frozen=True, slots=True)
class Hit:
    """One successful expression match inside a sentence."""

    expression: str
    step_def: StepRegistration
    match_start: int  # UTF-16 offset in sentence
    match_end: int  # UTF-16 offset in sentence
    args: tuple  # matched argument values (typed by their ParameterType)
    param_spans: tuple[ParamSpan, ...]  # UTF-16 spans per captured parameter


@dataclass(frozen=True, slots=True)
class AmbiguityCollision:
    """Two or more hits that start at the same position and have equal length."""

    match_start: int
    match_end: int
    candidates: tuple[Hit, ...]


@dataclass(frozen=True, slots=True)
class ResolvedSteps:
    """Tagged result of resolve_hits.

    ``kind == "ok"``        → ``steps`` holds the greedy non-overlapping selection.
    ``kind == "ambiguous"`` → ``collisions`` holds the ambiguity groups.
    """

    kind: Literal["ok", "ambiguous"]
    steps: tuple[Hit, ...] = field(default_factory=tuple)
    collisions: tuple[AmbiguityCollision, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Internal helper — mirrors cloneRegexpWithGlobal in matcher.ts
# ---------------------------------------------------------------------------


def _make_unanchored_pattern(step: StepRegistration) -> re.Pattern[str]:
    """Return a compiled, un-anchored pattern from the step's CucumberExpression.

    The cucumber-expressions library (Python) produces anchored regexps (^...$).
    We strip the anchors so re.finditer can find substring matches, mirroring
    the JS cloneRegexpWithGlobal helper.

    The compiled ``re.Pattern`` from ``tree_regexp.regexp`` is used to preserve
    any flags set by the library (currently only re.UNICODE / flag 32).
    """
    compiled = step.compiled.tree_regexp.regexp  # re.Pattern
    source = compiled.pattern
    if source.startswith("^"):
        source = source[1:]
    if source.endswith("$"):
        source = source[:-1]
    return re.compile(source, compiled.flags)


# ---------------------------------------------------------------------------
# find_hits
# ---------------------------------------------------------------------------


def find_hits(sentence: str, registry: Registry) -> tuple[Hit, ...]:
    """Return every expression match found anywhere in *sentence*.

    Mirrors ``findHits`` in matcher.ts exactly:
    * For each step, scan with the un-anchored regexp using ``re.finditer``.
    * Delegate to ``step.compiled.match(matched_text)`` for argument values
      and group offsets (which are code-point offsets within the matched text).
    * Convert all offsets to UTF-16 before building ``Hit``/``ParamSpan``.
    """
    hits: list[Hit] = []
    for step in registry.steps:
        pattern = _make_unanchored_pattern(step)
        pos = 0
        while pos <= len(sentence):
            m = pattern.search(sentence, pos)
            if m is None:
                break

            matched_text = m.group(0)

            # Delegate argument extraction to cucumber-expressions.
            # match() expects the full matched text (anchored internally).
            arguments = step.compiled.match(matched_text)

            # Build args tuple
            args: tuple = tuple(arg.value for arg in (arguments or []))

            # Build param_spans — convert code-point group offsets to UTF-16.
            param_spans: list[ParamSpan] = []
            for arg in arguments or []:
                g = arg.group
                gs = g.start
                ge = g.end
                if isinstance(gs, int) and isinstance(ge, int):
                    # group.start / group.end are cp offsets within matched_text.
                    # Add m.start() to get absolute cp index in sentence, then
                    # convert to UTF-16.
                    abs_cp_start = m.start() + gs
                    abs_cp_end = m.start() + ge
                    param_spans.append(
                        ParamSpan(
                            start=to_utf16_offset(sentence, abs_cp_start),
                            end=to_utf16_offset(sentence, abs_cp_end),
                        )
                    )

            hits.append(
                Hit(
                    expression=step.expression,
                    step_def=step,
                    match_start=to_utf16_offset(sentence, m.start()),
                    match_end=to_utf16_offset(sentence, m.end()),
                    args=args,
                    param_spans=tuple(param_spans),
                )
            )

            # Advance: if the match was empty, step one character (mirrors
            # the JS `if (m[0].length === 0) re.lastIndex++` guard).
            if len(matched_text) == 0:
                pos = m.start() + 1
            else:
                pos = m.end()

    return tuple(hits)


# ---------------------------------------------------------------------------
# resolve_hits
# ---------------------------------------------------------------------------


def resolve_hits(hits: tuple[Hit, ...] | list[Hit]) -> ResolvedSteps:
    """Select the best non-overlapping hits, or report ambiguities.

    Mirrors ``resolveHits`` in matcher.ts exactly:
    1. Sort hits by match_start ascending, then by match length descending
       (longer match first for the same start position).
    2. Scan for ambiguities: consecutive hits with the same start AND the same
       length form a collision group.
    3. If any collisions exist, return ``kind="ambiguous"``.
    4. Otherwise, greedily select non-overlapping hits left-to-right.
    """
    hits_list = list(hits)
    if not hits_list:
        return ResolvedSteps(kind="ok", steps=(), collisions=())

    sorted_hits = sorted(
        hits_list,
        key=lambda h: (h.match_start, -(h.match_end - h.match_start)),
    )

    # --- ambiguity detection ---
    collisions: list[AmbiguityCollision] = []
    i = 0
    while i < len(sorted_hits):
        here = sorted_hits[i]
        here_len = here.match_end - here.match_start
        tied: list[Hit] = [here]
        j = i + 1
        while j < len(sorted_hits):
            candidate = sorted_hits[j]
            if (
                candidate.match_start == here.match_start
                and candidate.match_end - candidate.match_start == here_len
            ):
                tied.append(candidate)
                j += 1
            else:
                break
        if len(tied) > 1:
            collisions.append(
                AmbiguityCollision(
                    match_start=here.match_start,
                    match_end=here.match_end,
                    candidates=tuple(tied),
                )
            )
        i = j  # advance past the tie group (mirrors `i = j - 1` then loop `i++`)

    if collisions:
        return ResolvedSteps(kind="ambiguous", steps=(), collisions=tuple(collisions))

    # --- greedy non-overlapping selection ---
    steps: list[Hit] = []
    cursor = -1
    for hit in sorted_hits:
        if hit.match_start < cursor:
            continue
        steps.append(hit)
        cursor = hit.match_end

    return ResolvedSteps(kind="ok", steps=tuple(steps), collisions=())
