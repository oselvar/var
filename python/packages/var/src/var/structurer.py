"""structurer.py — port of typescript/packages/var-core/src/structurer.ts.

Groups scanned blocks into Examples, tracking heading scope and orphan attachments.
"""

from __future__ import annotations

import re

from var.ast import (
    Block,
    Example,
    Fence,
    Table,
    VarDoc,
)
from var.span import span_from_offsets, utf16_slice


def structure(path: str, source: str, blocks: tuple[Block, ...]) -> VarDoc:
    """Group *blocks* into Examples, scoped by headings, with orphan attachments."""
    examples: list[Example] = []
    orphan_attachments: list[Table | Fence] = []
    scope_stack: list[tuple[int, str]] = []  # (level, text)
    last_example_idx = -1
    attachment_open = False

    for block in blocks:
        kind = block.kind

        if kind == "heading":
            # Pop deeper-or-equal-level entries before pushing the new heading.
            while scope_stack and scope_stack[-1][0] >= block.level:  # type: ignore[union-attr]
                scope_stack.pop()
            scope_stack.append((block.level, block.text))  # type: ignore[union-attr]
            attachment_open = False

        elif kind in ("paragraph", "list_item", "blockquote"):
            # Gherkin shape: a Given→table→When→fence flow comes out as
            # [paragraph, table, paragraph, fence]
            # and the user wants all four blocks in one example. Merge when the
            # previous example's last block is an attachment (table/fence) AND
            # there's no blank line between them.
            if attachment_open and last_example_idx >= 0:
                prev = examples[last_example_idx]
                prev_last = prev.body[-1] if prev.body else None
                last_is_attachment = prev_last is not None and prev_last.kind in (
                    "table",
                    "fence",
                )
                if last_is_attachment:
                    between = utf16_slice(
                        source,
                        prev.span.end_offset,  # type: ignore[union-attr]
                        block.span.start_offset,  # type: ignore[union-attr]
                    )
                    if not re.search(r"\n\s*\n", between):
                        new_span = span_from_offsets(
                            source,
                            prev.span.start_offset,  # type: ignore[union-attr]
                            block.span.end_offset,  # type: ignore[union-attr]
                        )
                        examples[last_example_idx] = Example(
                            scope_stack=prev.scope_stack,
                            span=new_span,
                            body=prev.body + (block,),
                        )
                        continue

            examples.append(
                Example(
                    scope_stack=tuple(text for _, text in scope_stack),
                    span=block.span,
                    body=(block,),
                )
            )
            last_example_idx = len(examples) - 1
            attachment_open = True

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
                )
            else:
                orphan_attachments.append(block)  # type: ignore[arg-type]

        elif kind == "thematic_break":
            attachment_open = False

    return VarDoc(
        path=path,
        source=source,
        examples=tuple(examples),
        orphan_attachments=tuple(orphan_attachments),
    )
