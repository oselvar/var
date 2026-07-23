"""structurer.py — port of typescript/packages/core/src/structurer.ts.

Groups scanned blocks into Examples, tracking heading scope and orphan attachments.

This is pure syntax — it does NOT decide where one example ends and the next
begins. Instead each candidate records `preceded_by_delimiter` (a heading or
`---` sits before it), and the planner groups adjacent matching candidates into
examples using that flag plus which candidates match a step. See ADR 0012.
"""

from __future__ import annotations

from varar_core.ast import (
    Block,
    Example,
    Fence,
    Table,
    VarDoc,
)
from varar_core.span import span_from_offsets


def structure(path: str, source: str, blocks: tuple[Block, ...]) -> VarDoc:
    """Group *blocks* into Examples, scoped by headings, with orphan attachments."""
    examples: list[Example] = []
    orphan_attachments: list[Table | Fence] = []
    scope_stack: list[tuple[int, str]] = []  # (level, text)
    last_example_idx = -1
    attachment_open = False
    # A heading or thematic break seen since the previous candidate — the next
    # candidate is then delimiter-preceded. Starts True so the first candidate in
    # the file counts as delimiter-preceded (nothing to merge into).
    delimiter_pending = True

    for block in blocks:
        kind = block.kind

        if kind == "heading":
            # Pop deeper-or-equal-level entries before pushing the new heading.
            while scope_stack and scope_stack[-1][0] >= block.level:  # type: ignore[union-attr]
                scope_stack.pop()
            scope_stack.append((block.level, block.text))  # type: ignore[union-attr]
            attachment_open = False
            delimiter_pending = True

        elif kind in ("paragraph", "list_item", "blockquote"):
            examples.append(
                Example(
                    scope_stack=tuple(text for _, text in scope_stack),
                    span=block.span,
                    body=(block,),
                    preceded_by_delimiter=delimiter_pending,
                )
            )
            last_example_idx = len(examples) - 1
            attachment_open = True
            delimiter_pending = False

        elif kind in ("table", "fence"):
            if attachment_open and last_example_idx >= 0:
                prev = examples[last_example_idx]
                new_span = span_from_offsets(
                    source,
                    prev.span.start_offset,  # type: ignore[union-attr]
                    block.span.end_offset,  # type: ignore[union-attr]
                )
                examples[last_example_idx] = Example(
                    scope_stack=prev.scope_stack,
                    span=new_span,
                    body=prev.body + (block,),
                    preceded_by_delimiter=prev.preceded_by_delimiter,
                )
            else:
                orphan_attachments.append(block)  # type: ignore[arg-type]

        elif kind == "thematic_break":
            attachment_open = False
            delimiter_pending = True

    return VarDoc(
        path=path,
        source=source,
        examples=tuple(examples),
        orphan_attachments=tuple(orphan_attachments),
    )
