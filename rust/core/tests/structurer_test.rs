//! Port of `StructurerTest.java` / `structurer.test.ts`.

use varar_core::ast::Block;
use varar_core::scanner::scan;
use varar_core::structurer::structure;

#[test]
fn every_paragraph_becomes_a_candidate_example_scoped_by_the_headings_above_it() {
    let source = "# Withdrawing cash\n\nGiven I have $100 in my account\n\n# Overdraft\n\nGiven I have $10 in my account";
    let var_doc = structure("test.md", source, scan(source));
    assert_eq!(2, var_doc.examples.len());
    assert_eq!(vec!["Withdrawing cash".to_string()], var_doc.examples[0].scope_stack);
    assert_eq!(vec!["Overdraft".to_string()], var_doc.examples[1].scope_stack);
}

#[test]
fn two_paragraphs_under_the_same_heading_each_become_a_separate_example() {
    let source = "## Example\n\nFirst paragraph.\n\nSecond paragraph.";
    let var_doc = structure("test.md", source, scan(source));
    assert_eq!(2, var_doc.examples.len());
    assert!(matches!(var_doc.examples[0].body[0], Block::Paragraph(_)));
    assert!(matches!(var_doc.examples[1].body[0], Block::Paragraph(_)));
    assert_eq!(vec!["Example".to_string()], var_doc.examples[0].scope_stack);
    assert_eq!(vec!["Example".to_string()], var_doc.examples[1].scope_stack);
}

#[test]
fn nested_headings_stack_into_an_outer_to_inner_scope_stack() {
    let source = "## Outer\n\nbody one\n\n### Inner\n\nbody two";
    let var_doc = structure("test.md", source, scan(source));
    assert_eq!(2, var_doc.examples.len());
    assert_eq!(vec!["Outer".to_string()], var_doc.examples[0].scope_stack);
    assert_eq!(vec!["Outer".to_string(), "Inner".to_string()], var_doc.examples[1].scope_stack);
}

#[test]
fn a_heading_at_the_same_level_pops_the_previous_sibling_off_the_scope_stack() {
    let source = "## A\n\nbody A\n\n## B\n\nbody B";
    let var_doc = structure("test.md", source, scan(source));
    assert_eq!(2, var_doc.examples.len());
    assert_eq!(vec!["A".to_string()], var_doc.examples[0].scope_stack);
    assert_eq!(vec!["B".to_string()], var_doc.examples[1].scope_stack);
}

#[test]
fn a_paragraph_with_no_enclosing_heading_has_an_empty_scope_stack() {
    let source = "standalone paragraph";
    let var_doc = structure("p.md", source, scan(source));
    assert_eq!(1, var_doc.examples.len());
    assert!(var_doc.examples[0].scope_stack.is_empty());
}

#[test]
fn headings_on_their_own_produce_no_examples() {
    let source = "# Title only\n\n## Sub-title\n\n### Another";
    let var_doc = structure("h.md", source, scan(source));
    assert_eq!(0, var_doc.examples.len());
}

#[test]
fn structure_preserves_the_source_string_verbatim() {
    let source = "# Hi\n\nbody";
    let var_doc = structure("p.md", source, scan(source));
    assert_eq!(source, var_doc.source);
    assert_eq!("p.md", var_doc.path);
}

#[test]
fn orphan_tables_and_fences_are_recorded_on_the_var_doc() {
    let source = "| name | age |\n|------|-----|\n| Bob  | 30  |";
    let var_doc = structure("o.md", source, scan(source));
    assert_eq!(1, var_doc.orphan_attachments.len());
    assert!(matches!(var_doc.orphan_attachments[0], varar_core::ast::TableOrFence::Table(_)));
}

#[test]
fn a_table_right_after_a_paragraph_attaches_to_that_paragraph_not_orphan() {
    let source =
        "## Example\n\nGiven these users:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |";
    let var_doc = structure("o.md", source, scan(source));
    assert_eq!(0, var_doc.orphan_attachments.len());
    let example = &var_doc.examples[0];
    assert!(example.body.iter().any(|b| matches!(b, Block::Table(_))));
}

#[test]
fn a_heading_between_a_paragraph_and_a_fence_makes_the_fence_an_orphan() {
    let source = "## A\n\npara\n\n## B\n\n```\nfenced body\n```\n";
    let var_doc = structure("h.md", source, scan(source));
    assert_eq!(1, var_doc.orphan_attachments.len());
    let example = &var_doc.examples[0];
    assert!(!example.body.iter().any(|b| matches!(b, Block::Fence(_))));
}
