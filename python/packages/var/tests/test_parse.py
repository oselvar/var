"""test_parse.py — port of typescript/packages/var-core/tests/parse.test.ts."""
from __future__ import annotations

from var.parse import parse


def test_parse_returns_var_doc_whose_examples_come_from_paragraphs_and_carry_heading_stack() -> None:
    source = "# Hello\n\nbody"
    var_doc = parse("hello.md", source)
    assert var_doc.path == "hello.md"
    assert var_doc.source == source
    # One paragraph → one Example. Scope from the heading above.
    assert len(var_doc.examples) == 1
    assert var_doc.examples[0].scope_stack == ("Hello",)
