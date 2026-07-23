"""test_structurer.py — port of typescript/packages/core/tests/structurer.test.ts."""
from __future__ import annotations

from varar_core.scanner import scan
from varar_core.structurer import structure


def test_every_paragraph_becomes_a_candidate_example_scoped_by_headings_above() -> None:
    source = (
        "# Withdrawing cash\n\nGiven I have $100 in my account\n\n"
        "# Overdraft\n\nGiven I have $10 in my account"
    )
    var_doc = structure("test.md", source, scan(source))
    assert len(var_doc.examples) == 2
    assert var_doc.examples[0].scope_stack == ("Withdrawing cash",)
    assert var_doc.examples[1].scope_stack == ("Overdraft",)


def test_two_paragraphs_under_same_heading_each_become_separate_example() -> None:
    source = "## Example\n\nFirst paragraph.\n\nSecond paragraph."
    var_doc = structure("test.md", source, scan(source))
    assert len(var_doc.examples) == 2
    assert var_doc.examples[0].body[0].kind == "paragraph"
    assert var_doc.examples[1].body[0].kind == "paragraph"
    assert var_doc.examples[0].scope_stack == ("Example",)
    assert var_doc.examples[1].scope_stack == ("Example",)


def test_nested_headings_stack_into_outer_to_inner_scope_stack() -> None:
    source = "## Outer\n\nbody one\n\n### Inner\n\nbody two"
    var_doc = structure("test.md", source, scan(source))
    assert len(var_doc.examples) == 2
    assert var_doc.examples[0].scope_stack == ("Outer",)
    assert var_doc.examples[1].scope_stack == ("Outer", "Inner")


def test_heading_at_same_level_pops_previous_sibling_off_scope_stack() -> None:
    source = "## A\n\nbody A\n\n## B\n\nbody B"
    var_doc = structure("test.md", source, scan(source))
    assert len(var_doc.examples) == 2
    assert var_doc.examples[0].scope_stack == ("A",)
    assert var_doc.examples[1].scope_stack == ("B",)


def test_paragraph_with_no_enclosing_heading_has_empty_scope_stack() -> None:
    source = "standalone paragraph"
    var_doc = structure("p.md", source, scan(source))
    assert len(var_doc.examples) == 1
    assert var_doc.examples[0].scope_stack == ()


def test_headings_on_their_own_produce_no_examples() -> None:
    source = "# Title only\n\n## Sub-title\n\n### Another"
    var_doc = structure("h.md", source, scan(source))
    assert len(var_doc.examples) == 0


def test_structure_preserves_source_string_verbatim() -> None:
    source = "# Hi\n\nbody"
    var_doc = structure("p.md", source, scan(source))
    assert var_doc.source == source
    assert var_doc.path == "p.md"


def test_orphan_tables_and_fences_are_recorded_on_var_doc() -> None:
    source = "| name | age |\n|------|-----|\n| Bob  | 30  |"
    var_doc = structure("o.md", source, scan(source))
    assert len(var_doc.orphan_attachments) == 1
    assert var_doc.orphan_attachments[0].kind == "table"


def test_table_right_after_paragraph_attaches_to_that_paragraph() -> None:
    source = (
        "## Example\n\nGiven these users:\n\n"
        "| name | age |\n|------|-----|\n| Bob  | 30  |"
    )
    var_doc = structure("o.md", source, scan(source))
    assert len(var_doc.orphan_attachments) == 0
    assert any(b.kind == "table" for b in var_doc.examples[0].body)


def test_heading_between_paragraph_and_fence_makes_fence_an_orphan() -> None:
    source = "## A\n\npara\n\n## B\n\n```\nfenced body\n```\n"
    var_doc = structure("h.md", source, scan(source))
    assert len(var_doc.orphan_attachments) == 1
    assert not any(b.kind == "fence" for b in var_doc.examples[0].body)


def test_preceded_by_delimiter_marks_candidates_after_heading_or_thematic_break() -> None:
    # ADR 0012: precededByDelimiter is true for the first candidate and any
    # candidate after a heading or a thematic break (`---`), false for an
    # adjacent paragraph with nothing between.
    source = "First para.\n\nSecond para.\n\n---\n\nThird para.\n\n## H\n\nFourth para."
    var_doc = structure("d.md", source, scan(source))
    assert [e.preceded_by_delimiter for e in var_doc.examples] == [
        True,  # first candidate in the file
        False,  # adjacent paragraph, no delimiter between
        True,  # after `---`
        True,  # after a heading
    ]
