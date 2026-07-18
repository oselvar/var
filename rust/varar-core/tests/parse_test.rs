//! Port of `ParseTest.java` / `parse.test.ts`.

use varar_core::parse::parse;

#[test]
fn parse_returns_a_var_doc_whose_examples_come_from_paragraphs_and_carry_the_heading_stack() {
    let source = "# Hello\n\nbody";
    let var_doc = parse("hello.md", source);
    assert_eq!("hello.md", var_doc.path);
    assert_eq!(source, var_doc.source);
    assert_eq!(1, var_doc.examples.len());
    assert_eq!(vec!["Hello".to_string()], var_doc.examples[0].scope_stack);
}
