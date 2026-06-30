"""conformance.py — var-doc and registry artifact projections.

Port of toVarDocArtifact and toRegistryArtifact from
typescript/packages/var-core/src/conformance.ts.
Serializes a VarDoc AST / Registry to the camelCase wire dicts expected by the
conformance golden files.
"""

from __future__ import annotations

from typing import Any

from cucumber_expressions.expression import CucumberExpression

from var.ast import (
    Blockquote,
    Example,
    Fence,
    Heading,
    InlineOffset,
    ListItem,
    Paragraph,
    Row,
    Table,
    ThematicBreak,
    VarDoc,
)
from var.plan import ExecutionPlan
from var.registry import Registry
from var.span import Span, utf16_slice


# ---------------------------------------------------------------------------
# Registry artifact projection
# ---------------------------------------------------------------------------


def parameter_type_names(compiled: CucumberExpression) -> list[str]:
    """Return parameter-type names in source order from a compiled expression.

    Port of ``parameterTypeNames`` in conformance.ts.  The TS implementation
    walks ``compiled.ast`` collecting ``NodeType.parameter`` nodes; in Python
    ``CucumberExpression`` does not expose ``.ast``, but ``compiled.parameter_types``
    is populated in source order by ``rewrite_parameter`` during ``__init__``,
    giving identical results.
    """
    return [pt.name for pt in compiled.parameter_types]


def to_registry_artifact(
    registry: Registry,
    parameter_types: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Project a Registry to the camelCase wire dict for the registry artifact.

    Port of ``toRegistryArtifact`` from conformance.ts.
    """
    if parameter_types is None:
        parameter_types = []
    return {
        "steps": [
            {
                "expression": s.expression,
                "parameterTypeNames": parameter_type_names(s.compiled),
            }
            for s in registry.steps
        ],
        "parameterTypes": [
            {"name": p["name"], "regexp": p["regexp"]} for p in parameter_types
        ],
    }


def _span(s: Span) -> dict[str, Any]:
    return {
        "startOffset": s.start_offset,
        "endOffset": s.end_offset,
        "startLine": s.start_line,
        "startCol": s.start_col,
        "endLine": s.end_line,
        "endCol": s.end_col,
    }


def _inline(io: InlineOffset) -> dict[str, Any]:
    return {
        "textOffset": io.text_offset,
        "sourceOffset": io.source_offset,
    }


def _row(r: Row) -> dict[str, Any]:
    return {
        "cells": list(r.cells),
        "cellSpans": [_span(cs) for cs in r.cell_spans],
        "span": _span(r.span),  # type: ignore[arg-type]
    }


def _block(b: Heading | Paragraph | ListItem | Blockquote | Table | Fence | ThematicBreak) -> dict[str, Any]:
    if isinstance(b, Paragraph):
        return {
            "kind": b.kind,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
            "inlineMap": [_inline(io) for io in b.inline_map],
        }
    if isinstance(b, Heading):
        return {
            "kind": b.kind,
            "level": b.level,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
        }
    if isinstance(b, ListItem):
        return {
            "kind": b.kind,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
            "inlineMap": [_inline(io) for io in b.inline_map],
            "ordered": b.ordered,
            "markerSpan": _span(b.marker_span),  # type: ignore[arg-type]
        }
    if isinstance(b, Blockquote):
        return {
            "kind": b.kind,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
            "inlineMap": [_inline(io) for io in b.inline_map],
        }
    if isinstance(b, Table):
        return {
            "kind": b.kind,
            "span": _span(b.span),  # type: ignore[arg-type]
            "header": _row(b.header),  # type: ignore[arg-type]
            "rows": [_row(r) for r in b.rows],
        }
    if isinstance(b, Fence):
        return {
            "kind": b.kind,
            "span": _span(b.span),  # type: ignore[arg-type]
            "info": b.info,
            "body": b.body,
            "bodySpan": _span(b.body_span),  # type: ignore[arg-type]
        }
    if isinstance(b, ThematicBreak):
        return {
            "kind": b.kind,
            "span": _span(b.span),  # type: ignore[arg-type]
        }
    raise TypeError(f"Unknown block type: {type(b)}")  # pragma: no cover


def _example(ex: Example) -> dict[str, Any]:
    return {
        "scopeStack": list(ex.scope_stack),
        "span": _span(ex.span),  # type: ignore[arg-type]
        "body": [_block(b) for b in ex.body],
    }


def to_var_doc_artifact(doc: VarDoc) -> dict[str, Any]:
    """Project a VarDoc to the camelCase wire dict for the var-doc artifact."""
    return {
        "path": doc.path,
        "examples": [_example(ex) for ex in doc.examples],
        "orphanAttachments": [_block(b) for b in doc.orphan_attachments],
    }


# ---------------------------------------------------------------------------
# Plan artifact projection
# ---------------------------------------------------------------------------


def _doc_string(ds: Any) -> dict[str, Any]:
    return {
        "content": ds.content,
        "contentType": ds.content_type,
        "span": _span(ds.span),
    }


def to_plan_artifact(execution_plan: ExecutionPlan) -> dict[str, Any]:
    """Project an ExecutionPlan to the camelCase wire dict for the plan artifact.

    Port of ``toPlanArtifact`` from conformance.ts.
    """
    source = execution_plan.var_doc.source

    def _step(step: Any) -> dict[str, Any]:
        step_names = parameter_type_names(step.step_def.compiled)
        result: dict[str, Any] = {
            "text": step.text,
            "matchSpan": _span(step.match_span),
            "paramSpans": [_span(s) for s in step.param_spans],
            "matchedExpression": step.step_def.expression,
            "args": [
                {
                    "value": utf16_slice(source, s.start_offset, s.end_offset),
                    "parameterType": step_names[i] if i < len(step_names) else None,
                }
                for i, s in enumerate(step.param_spans)
            ],
        }
        if step.data_table is not None:
            result["dataTable"] = _block(step.data_table)
        if step.doc_string is not None:
            result["docString"] = _doc_string(step.doc_string)
        return result

    def _planned_example(ex: Any) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": ex.name,
            "scopeStack": list(ex.scope_stack),
            "span": _span(ex.span),
            "expectedOutcome": ex.expected_outcome if ex.expected_outcome is not None else "pass",
        }
        if ex.expected_error_message is not None:
            result["expectedErrorMessage"] = ex.expected_error_message
        result["steps"] = [_step(s) for s in ex.steps]
        return result

    return {
        "examples": [_planned_example(ex) for ex in execution_plan.examples],
        "diagnostics": [
            {
                "code": d.code,
                "severity": d.severity,
                "span": _span(d.span),
            }
            for d in execution_plan.diagnostics
        ],
    }
