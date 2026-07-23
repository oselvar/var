"""plan.py — port of var-core/src/plan.ts.

Produces an ExecutionPlan from a VarDoc + Registry by matching step
expressions against every text-bearing block in each example, attaching
trailing tables / fenced code blocks, detecting header-bound tables, and
collecting diagnostics.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from varar_core.ast import Block, Example, Fence, SegmentOffset, Table, VarDoc
from varar_core.cell_diff import RowCheck
from varar_core.diagnostics import (
    AmbiguousInput,
    Candidate,
    Diagnostic,
    ambiguous_match,
    error_fence_without_step,
)
from varar_core.matcher import Hit, find_hits, resolve_hits
from varar_core.registry import Registry, StepRegistration
from varar_core.sentences import split_sentences
from varar_core.span import Span, span_from_offsets, to_utf16_offset, utf16_len


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DocString:
    content: str
    content_type: str
    span: Span


@dataclass(frozen=True, slots=True)
class PlannedStep:
    text: str
    match_span: Span
    param_spans: tuple[Span, ...]
    step_def: StepRegistration
    args: tuple
    # Per-argument display formatters from the matched parameter types,
    # aligned with args. Presentation only — see param_diff.py.
    formats: tuple = ()
    data_table: Table | None = None
    doc_string: DocString | None = None


@dataclass(frozen=True, slots=True)
class HeaderBinding:
    """Describes the binding paragraph shared by all rows of a header-bound table."""

    match_span: Span
    param_spans: tuple[Span, ...]
    step_def: StepRegistration


# RowCheck is imported from cell_diff (single canonical definition, matching
# the shared module layout where RowCheck lives only in cell_diff).


@dataclass(frozen=True, slots=True)
class PlannedExample:
    name: str
    scope_stack: tuple[str, ...]
    span: Span
    steps: tuple[PlannedStep, ...]
    header_binding: HeaderBinding | None = None
    row_checks: tuple[RowCheck, ...] | None = None
    expected_outcome: Literal["fail"] | None = None
    expected_error_message: str | None = None


@dataclass(frozen=True, slots=True)
class ExecutionPlan:
    var_doc: VarDoc
    examples: tuple[PlannedExample, ...]
    diagnostics: tuple[Diagnostic, ...]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _lift_segment_offset(
    segment_map: tuple[SegmentOffset, ...],
    text_offset: int,
) -> int:
    """Mirror liftSegmentOffset from plan.ts.

    Walk segment_map to find the best entry whose text_offset <= the given
    text_offset, then map source_offset + delta back to a source offset.
    """
    best: SegmentOffset | None = segment_map[0] if segment_map else None
    for entry in segment_map:
        if entry.text_offset <= text_offset:
            best = entry
    if best is None:
        raise ValueError("empty segment_map")
    return best.source_offset + (text_offset - best.text_offset)


def _lift_span(source: str, block: Block, block_start: int, block_end: int) -> Span:
    """Mirror liftSpan from plan.ts.

    Maps a UTF-16 [block_start, block_end) offset range within the block's
    text back to a source-document Span.  Only paragraph / list_item /
    blockquote blocks carry a segment_map; for other block kinds the block's
    own span is returned unchanged.
    """
    if block.kind not in ("paragraph", "list_item", "blockquote"):
        return block.span  # type: ignore[return-value]
    segment_map: tuple[SegmentOffset, ...] = block.segment_map  # type: ignore[union-attr]
    start_src = _lift_segment_offset(segment_map, block_start)
    end_src = _lift_segment_offset(segment_map, block_end)
    return span_from_offsets(source, start_src, end_src)


# ---------------------------------------------------------------------------
# Block-level planning
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Ambiguity:
    match_start: int
    match_end: int
    candidates: tuple[Hit, ...]


@dataclass(frozen=True, slots=True)
class _BlockPlan:
    steps: tuple[Hit, ...]
    ambiguities: tuple[_Ambiguity, ...]


def _plan_block(text: str, registry: Registry) -> _BlockPlan:
    """Mirror planBlock from plan.ts.

    Splits *text* into sentences, runs find_hits + resolve_hits on each, and
    adjusts the offsets back to block-text positions.
    """
    all_steps: list[Hit] = []
    all_ambiguities: list[_Ambiguity] = []

    for sentence in split_sentences(text):
        hits = find_hits(sentence.text, registry)
        # Adjust hit offsets from sentence-relative to block-text-relative.
        adjusted: list[Hit] = []
        for h in hits:
            adjusted.append(
                Hit(
                    expression=h.expression,
                    step_def=h.step_def,
                    match_start=h.match_start + sentence.start_offset,
                    match_end=h.match_end + sentence.start_offset,
                    args=h.args,
                    param_spans=tuple(
                        type(p)(
                            start=p.start + sentence.start_offset,
                            end=p.end + sentence.start_offset,
                        )
                        for p in h.param_spans
                    ),
                    formats=h.formats,
                )
            )
        resolved = resolve_hits(tuple(adjusted))
        if resolved.kind == "ambiguous":
            for c in resolved.collisions:
                all_ambiguities.append(
                    _Ambiguity(
                        match_start=c.match_start,
                        match_end=c.match_end,
                        candidates=c.candidates,
                    )
                )
        elif resolved.steps:
            all_steps.extend(resolved.steps)

    return _BlockPlan(steps=tuple(all_steps), ambiguities=tuple(all_ambiguities))


# ---------------------------------------------------------------------------
# Header-bound table detection
# ---------------------------------------------------------------------------


def _word_offset(haystack: str, word: str) -> int:
    """Return the start index of *word* as a whole word in *haystack*, or -1.

    Mirror wordOffset from plan.ts — case-sensitive, whole-word match using
    Unicode letter/number/underscore boundaries.
    """
    escaped = re.escape(word)
    m = re.search(
        r"(?<![^\W_])" + escaped + r"(?![^\W_])",
        haystack,
        re.UNICODE,
    )
    return m.start() if m else -1


def _detect_header_bound(
    ex: Example,
    steps_by_block: dict[int, list[PlannedStep]],
    source: str,
) -> (
    tuple[Table, PlannedStep, tuple[Span, ...]]
    | None
):
    """Mirror detectHeaderBound from plan.ts.

    Scans the example body for a table whose every header cell name appears
    (case-sensitive, whole word) in the block immediately above it, and that
    block has planned steps.  Returns (table, last_step, header_spans) or None.
    """
    body = ex.body
    for idx in range(1, len(body)):
        here = body[idx]
        if here.kind != "table":
            continue
        above = body[idx - 1]
        if above.kind not in ("paragraph", "list_item", "blockquote"):
            continue
        steps = steps_by_block.get(idx - 1)
        if not steps:
            continue
        table: Table = here  # type: ignore[assignment]
        assert table.header is not None
        header_cells = table.header.cells
        offsets = [_word_offset(above.text, cell) for cell in header_cells]  # type: ignore[union-attr]
        if any(o < 0 for o in offsets):
            continue
        # Convert code-point offsets from _word_offset to UTF-16 offsets
        # (m.start() is a code-point index; _lift_span expects UTF-16 code units).
        utf16_offsets = [to_utf16_offset(above.text, o) for o in offsets]  # type: ignore[union-attr]
        header_spans = tuple(
            _lift_span(source, above, utf16_offsets[i], utf16_offsets[i] + utf16_len(header_cells[i]))  # type: ignore[arg-type]
            for i in range(len(header_cells))
        )
        return table, steps[-1], header_spans
    return None


# ---------------------------------------------------------------------------
# Derive example name
# ---------------------------------------------------------------------------


def derive_example_name(body: tuple[Block, ...]) -> str:
    """Mirror deriveExampleName from plan.ts."""
    primary = next(
        (b for b in body if b.kind in ("paragraph", "list_item", "blockquote")),
        None,
    )
    if primary is None:
        return ""
    # The entire paragraph is the test name — an example is often a paragraph
    # where only some sentences match steps, and the narration around them is
    # part of what the test asserts about. Hard line breaks inside the
    # paragraph collapse to single spaces (test names must be one line), and a
    # single trailing . ! ? is stripped (embedded terminators are left alone).
    name = re.sub(r"\s+", " ", primary.text).strip()  # type: ignore[union-attr]
    return re.sub(r"[.!?]$", "", name)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Candidate units and merged-example builders (ADR 0012)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _HeaderBoundUnit:
    """A standalone header-bound candidate — one PlannedExample per data row."""

    rows: tuple[PlannedExample, ...]


@dataclass(frozen=True, slots=True)
class _StepsUnit:
    """A single candidate paragraph, planned in isolation."""

    matched: bool
    preceded_by_delimiter: bool
    name: str
    scope_stack: tuple[str, ...]
    span: Span
    steps: tuple[PlannedStep, ...]
    expected_outcome: Literal["fail"] | None = None
    expected_error_message: str | None = None


_CandidateUnit = _HeaderBoundUnit | _StepsUnit


@dataclass(slots=True)
class _MergedExample:
    """A step-bearing candidate accumulating adjacent matching candidates into
    one example while no delimiter separates them."""

    name: str
    scope_stack: tuple[str, ...]
    start_offset: int
    end_offset: int
    steps: list[PlannedStep]
    expected_outcome: Literal["fail"] | None = None
    expected_error_message: str | None = None


def _start_merged(unit: _StepsUnit) -> _MergedExample:
    return _MergedExample(
        name=unit.name,
        scope_stack=unit.scope_stack,
        start_offset=unit.span.start_offset,
        end_offset=unit.span.end_offset,
        steps=list(unit.steps),
        expected_outcome=unit.expected_outcome,
        expected_error_message=unit.expected_error_message,
    )


def _merge_into(open_ex: _MergedExample, unit: _StepsUnit) -> None:
    open_ex.end_offset = unit.span.end_offset
    open_ex.steps.extend(unit.steps)
    # Any error fence in a merged part marks the whole example expected-to-fail;
    # keep the first message we see.
    if unit.expected_outcome == "fail":
        open_ex.expected_outcome = "fail"
        if (
            open_ex.expected_error_message is None
            and unit.expected_error_message is not None
        ):
            open_ex.expected_error_message = unit.expected_error_message


def _finish_merged(open_ex: _MergedExample, source: str) -> PlannedExample:
    span = span_from_offsets(source, open_ex.start_offset, open_ex.end_offset)
    return PlannedExample(
        name=open_ex.name,
        scope_stack=open_ex.scope_stack,
        span=span,
        steps=tuple(open_ex.steps),
        expected_outcome=open_ex.expected_outcome,
        expected_error_message=open_ex.expected_error_message,
    )


def plan(var_doc: VarDoc, registry: Registry) -> ExecutionPlan:
    """Mirror plan() from plan.ts.

    Phase 1 plans each candidate paragraph independently into a "unit"; phase 2
    groups adjacent matching candidates into examples using each candidate's
    `preceded_by_delimiter` flag plus whether it matched a step. See ADR 0012.
    """
    diagnostics: list[Diagnostic] = []

    # Phase 1: plan each candidate paragraph independently into a "unit".
    units = [_plan_candidate(ex, var_doc, registry, diagnostics) for ex in var_doc.examples]

    # Phase 2: group adjacent candidates into examples. A matching candidate
    # continues the open example when no delimiter (heading / `---`) precedes it;
    # otherwise it starts a new one. A non-matching candidate (prose) is a
    # delimiter: it closes the open example and is dropped. A header-bound table
    # candidate is standalone — it already emits one example per row.
    examples: list[PlannedExample] = []
    open_ex: _MergedExample | None = None

    def flush() -> None:
        nonlocal open_ex
        if open_ex is not None:
            examples.append(_finish_merged(open_ex, var_doc.source))
        open_ex = None

    for unit in units:
        if isinstance(unit, _HeaderBoundUnit):
            flush()
            examples.extend(unit.rows)
            continue
        if not unit.matched:
            # Prose paragraph — a delimiter. Drop it and end the open example.
            flush()
            continue
        if open_ex is not None and not unit.preceded_by_delimiter:
            _merge_into(open_ex, unit)
        else:
            flush()
            open_ex = _start_merged(unit)
    flush()

    # A table or fence that doesn't attach to a step is just Markdown content,
    # not a mistake — it produces no diagnostic.

    return ExecutionPlan(
        var_doc=var_doc,
        examples=tuple(examples),
        diagnostics=tuple(diagnostics),
    )


def _plan_candidate(
    ex: Example,
    var_doc: VarDoc,
    registry: Registry,
    diagnostics: list[Diagnostic],
) -> _CandidateUnit:
    """Plan a single candidate paragraph (plus its attached tables/fences) in
    isolation. Emits ambiguity / error-fence diagnostics into *diagnostics*."""
    had_ambiguous = False

    # ------------------------------------------------------------------
    # Pass 1: plan each text-bearing block, collect steps by block index.
    # ------------------------------------------------------------------
    steps_by_block: dict[int, list[PlannedStep]] = {}

    for idx, block in enumerate(ex.body):
        if block.kind not in ("paragraph", "list_item", "blockquote"):
            continue
        result = _plan_block(block.text, registry)  # type: ignore[union-attr]

        for collision in result.ambiguities:
            span = _lift_span(
                var_doc.source,
                block,
                collision.match_start,
                collision.match_end,
            )
            diagnostics.append(
                ambiguous_match(
                    AmbiguousInput(
                        text=block.text[  # type: ignore[index]
                            # slice using cp indices — for span reporting
                            # we need the UTF-16 text; here we slice the
                            # Python str for the diagnostic message only.
                            _u16_to_cp(block.text, collision.match_start)  # type: ignore[union-attr]
                            : _u16_to_cp(block.text, collision.match_end)  # type: ignore[union-attr]
                        ],
                        span=span,
                        candidates=tuple(
                            Candidate(
                                expression=c.expression,
                                source_file=c.step_def.expression_source_file,
                                source_line=c.step_def.expression_source_line,
                            )
                            for c in collision.candidates
                        ),
                    )
                )
            )
            had_ambiguous = True

        if not had_ambiguous and result.steps:
            block_steps: list[PlannedStep] = [
                PlannedStep(
                    text=_utf16_slice(block.text, hit.match_start, hit.match_end),  # type: ignore[union-attr]
                    match_span=_lift_span(
                        var_doc.source, block, hit.match_start, hit.match_end
                    ),
                    param_spans=tuple(
                        _lift_span(var_doc.source, block, p.start, p.end)
                        for p in hit.param_spans
                    ),
                    step_def=hit.step_def,
                    args=hit.args,
                    formats=hit.formats,
                )
                for hit in result.steps
            ]
            steps_by_block[idx] = block_steps

    # ------------------------------------------------------------------
    # Header-bound table detection
    # ------------------------------------------------------------------
    bound = _detect_header_bound(ex, steps_by_block, var_doc.source) if not had_ambiguous else None

    if bound is not None:
        table, binding_step, header_spans = bound
        header_binding = HeaderBinding(
            match_span=binding_step.match_span,
            param_spans=header_spans,
            step_def=binding_step.step_def,
        )
        assert table.header is not None
        rows: list[PlannedExample] = []
        for row in table.rows:
            row_object: dict[str, str] = {}
            for i, cell_name in enumerate(table.header.cells):
                row_object[cell_name] = row.cells[i] if i < len(row.cells) else ""
            row_step = PlannedStep(
                text=binding_step.text,
                match_span=row.span,  # type: ignore[arg-type]
                param_spans=binding_step.param_spans,
                step_def=binding_step.step_def,
                args=(*binding_step.args, row_object),
                formats=binding_step.formats,
            )
            row_checks = tuple(
                RowCheck(
                    column=cell_name,
                    value=row.cells[i] if i < len(row.cells) else "",
                    span=(
                        row.cell_spans[i]
                        if i < len(row.cell_spans)
                        else row.span  # type: ignore[arg-type]
                    ),
                )
                for i, cell_name in enumerate(table.header.cells)
            )
            rows.append(
                PlannedExample(
                    name=" / ".join(row.cells),
                    scope_stack=(*ex.scope_stack, binding_step.text),
                    span=row.span,  # type: ignore[arg-type]
                    steps=(row_step,),
                    header_binding=header_binding,
                    row_checks=row_checks,
                )
            )
        return _HeaderBoundUnit(rows=tuple(rows))

    # ------------------------------------------------------------------
    # Error fence detection
    # ------------------------------------------------------------------
    error_fence: Fence | None = next(
        (b for b in ex.body if b.kind == "fence" and b.info == "error"),  # type: ignore[union-attr]
        None,
    )

    # ------------------------------------------------------------------
    # Pass 2: attach trailing table / fence to the last step in a block.
    # ------------------------------------------------------------------
    attachments: dict[
        int,
        tuple[Table | None, DocString | None],
    ] = {}

    for idx in range(1, len(ex.body)):
        here = ex.body[idx]
        if here.kind == "table" and (idx - 1) in steps_by_block:
            prev_data, prev_doc = attachments.get(idx - 1, (None, None))
            attachments[idx - 1] = (here, prev_doc)  # type: ignore[assignment]
        elif (
            here.kind == "fence"
            and here.info != "error"  # type: ignore[union-attr]
            and (idx - 1) in steps_by_block
        ):
            fence: Fence = here  # type: ignore[assignment]
            prev_data, prev_doc = attachments.get(idx - 1, (None, None))
            attachments[idx - 1] = (
                prev_data,
                DocString(
                    content=fence.body,
                    content_type=fence.info,
                    span=fence.body_span,  # type: ignore[arg-type]
                ),
            )

    # ------------------------------------------------------------------
    # Pass 3: rebuild the final step list, applying attachments.
    # ------------------------------------------------------------------
    final_steps: list[PlannedStep] = []
    for idx in range(len(ex.body)):
        block_steps = steps_by_block.get(idx, [])
        attach = attachments.get(idx)
        for s_idx, step in enumerate(block_steps):
            if s_idx == len(block_steps) - 1 and attach is not None:
                data_table, doc_string = attach
                final_steps.append(
                    PlannedStep(
                        text=step.text,
                        match_span=step.match_span,
                        param_spans=step.param_spans,
                        step_def=step.step_def,
                        args=step.args,
                        formats=step.formats,
                        data_table=data_table,
                        doc_string=doc_string,
                    )
                )
            else:
                final_steps.append(step)

    runnable_steps: tuple[PlannedStep, ...] = () if had_ambiguous else tuple(final_steps)

    # An `error` fence without a runnable step is an author mistake.
    if error_fence is not None and not runnable_steps:
        diagnostics.append(error_fence_without_step(error_fence.span))  # type: ignore[arg-type]

    # Build expected-outcome fields.
    expected_outcome: Literal["fail"] | None = None
    expected_error_message: str | None = None
    if error_fence is not None:
        expected_outcome = "fail"
        msg = error_fence.body.strip()
        if msg:
            expected_error_message = msg

    return _StepsUnit(
        matched=len(runnable_steps) > 0,
        preceded_by_delimiter=ex.preceded_by_delimiter,
        name=derive_example_name(ex.body),
        scope_stack=ex.scope_stack,
        span=ex.span,  # type: ignore[arg-type]
        steps=runnable_steps,
        expected_outcome=expected_outcome,
        expected_error_message=expected_error_message,
    )


# ---------------------------------------------------------------------------
# UTF-16 utilities (local — avoid polluting span.py)
# ---------------------------------------------------------------------------


def _u16_to_cp(text: str, u16_offset: int) -> int:
    """Code-point index in *text* for the given UTF-16 offset."""
    count = 0
    for i, ch in enumerate(text):
        if count >= u16_offset:
            return i
        count += 2 if ord(ch) > 0xFFFF else 1
    return len(text)


def _utf16_slice(text: str, start_u16: int, end_u16: int) -> str:
    """Slice *text* using UTF-16 offsets."""
    a = _u16_to_cp(text, start_u16)
    b = _u16_to_cp(text, end_u16)
    return text[a:b]
